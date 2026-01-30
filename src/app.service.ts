import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { createWorker } from 'tesseract.js';
import { pdf } from 'pdf-to-img';
import path from 'path/posix';
import ollama from 'ollama';

interface ILLMResponse {
  skills: string[];
  experience: string[];
  education: string[];
}

@Injectable()
export class AppService {
  constructor(private readonly logger: Logger) {}

  async extractTextWithOCR(file: Buffer, jobDescription: string) {
    const tempDir = path.join(__dirname, '../temp-pages');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const document = await pdf(file, { scale: 3 });

    const imagePaths: string[] = [];
    let counter = 1;
    for await (const image of document) {
      const imagePath = path.join(
        tempDir,
        `page${counter}_${new Date().getTime()}.png`,
      );
      imagePaths.push(imagePath);
      fs.writeFileSync(imagePath, image);
      counter++;
    }
    this.logger.log('Images extracted.');

    const worker = await createWorker('eng');
    const fullTextArray: string[] = [];

    for (const imagePath of imagePaths) {
      const ret = await worker.recognize(imagePath);
      fullTextArray.push(ret.data.text);
    }

    await worker.terminate();

    this.logger.log('OCR completed.');
    for (const imagePath of imagePaths) {
      try {
        this.logger.log(`Deleting ${imagePath}.`);
        fs.unlinkSync(imagePath);
      } catch (err) {
        this.logger.error(`Error deleting ${imagePath}:`, err);
      }
    }

    const jobRequirements = await this.getJobRequirements(jobDescription);

    const resumeKeyWords = await this.getResumeKeyWords(fullTextArray);

    const skills = await this.compareLists(
      jobRequirements.skills,
      resumeKeyWords.skills,
    );

    console.log('Job Requirements skills:', jobRequirements.skills);
    console.log('Resume Key Words skills:', resumeKeyWords.skills);

    const experience = this.compareLists(
      jobRequirements.experience,
      resumeKeyWords.experience,
    );

    console.log('Job Requirements experience:', jobRequirements.experience);
    console.log('Resume Key Words experience:', resumeKeyWords.experience);

    const education = this.compareLists(
      jobRequirements.education,
      resumeKeyWords.education,
    );

    console.log('Job Requirements education:', jobRequirements.education);
    console.log('Resume Key Words education:', resumeKeyWords.education);

    return { skills, experience, education };
  }

  private async getJobRequirements(
    jobDescription: string,
  ): Promise<ILLMResponse> {
    const response = await ollama.chat({
      model: 'gemma3:270m',
      messages: [
        {
          role: 'user',
          content: `
          Extract ONLY the explicit requirements from the JOB DESCRIPTION.

          RULES:
          - Do NOT infer or guess.
          - Do NOT add technologies not mentioned.
          - Use ONLY the text provided.
          - If something is not mentioned, do NOT include it.

          Return ONLY valid JSON in this format:

          {
            "skills": string[],
            "experience": string[],
            "education": string[]
          }

          JOB DESCRIPTION:
          ${jobDescription}`,
        },
      ],
      format: 'json',
    });
    return JSON.parse(response.message.content);
  }

  private async getResumeKeyWords(
    fullTextArray: string[],
  ): Promise<ILLMResponse> {
    const response = await ollama.chat({
      model: 'gemma3:270m',
      messages: [
        {
          role: 'user',
          content: `
          Extract ONLY the information explicitly present in the RESUME.

          RULES:
          - Do NOT infer.
          - Do NOT normalize.
          - Do NOT invent.

          Return ONLY valid JSON:

          {
            "skills": string[],
            "experience": string[],
            "education": string[]
          }

          RESUME:
          ${fullTextArray}
          `,
        },
      ],
      format: 'json',
    });
    return JSON.parse(response.message.content);
  }

  private async compareLists(required: string[], present: string[]) {
    return;
  }
}
