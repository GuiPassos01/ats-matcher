import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { createWorker } from 'tesseract.js';
import { pdf } from 'pdf-to-img';
import path from 'path/posix';
import ollama from 'ollama';
import { parseJSON } from 'ollama/src/utils.js';

@Injectable()
export class AppService {
  constructor(private readonly logger: Logger) {}

  async extractTextWithOCR(file: Buffer) {
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

    const response = await ollama.chat({
      model: 'gemma3:270m',
      messages: [
        {
          role: 'user',
          content: `
        Please compare the following resume to the job description and give me ONLY a json object that contains the matching skills, the missing skills, matching experience, missing experience, matching education, missing education, please consider the context and the synonyms, for example: A backend developer experience is the same as a backend software engineer  
        ${fullTextArray}
        Job Description: Get Ready To:

    Collaborate in a Cross-Functional Team: Work closely with Frontend Engineers, Product Teams, Designers, and QA professionals to create seamless experiences.
    Participate in Product Planning: From discovery to deployment, we value your input throughout all stages of the Software Development Lifecycle 
    Develop and Enhance Features: Collaborate to develop robust new features, APIs, and continuously improve our industry-leading products. Help find and fix bugs at "Deel Speed."
    Provide an Exceptional, Customer-Centric Experience: Ensure top-tier products and services through quality engineering and attentive, customer-focused development.

What you’ll bring to the Team:

    Expertise in Backend Development: Strong proficiency in Node.js, TypeScript/JavaScript best practices, along with experience in at least one other server-side language.
    Database Mastery: You're a SQL guru, particularly with PostgreSQL, handling query optimization, data migrations, and database modeling.
    Solid Grasp of OOP and Design Patterns: Strong understanding of object-oriented programming principles and design patterns, with experience in building and extending classes
    Scalability Focus: Experience in designing systems for scalability, ensuring they manage rapid growth and increasing demands efficiently.
    High-Volume Performance: Proven expertise in optimizing systems for large transaction volumes, handling concurrency, idempotency, and performance under load.
    API Development: Skilled in building APIs, including input validation, JWT tokens, and ensuring security & scalability through queue-based systems.
    Experience: at least 4 years of experience as a Software Engineer.

You're the Engineer We're Looking for if You:

    Excel in Application Development: You thrive in designing, coding, testing, and maintaining applications using the tech stack mentioned above.
    Thrive in Remote Collaboration: Excel in a remote-first environment with proactive communication and strong asynchronous collaboration skills to ensure alignment and effective teamwork. You’ve successfully worked in distributed teams 
    Blending Autonomy and Collaboration: You take ownership of projects while excelling in team environments, driving shared success.
    Communicate Complex Ideas Easily: You can clearly explain technical concepts to both technical and non-technical stakeholders.
    Solve Problems with Optimism: You’re passionate about solving customer problems with your coding superpowers, and approach challenges with Default Optimism whilst maintaining a balanced perspective
    Business-Focused Development: You take a business-focused approach to software development, with a keen eye on delivering high-value outcomes for our clients.
    Genuine Care: You embody our core value of Genuine Care, understanding how your work impacts our customers.

Extra brownie points if you:

    Have SaaS experience: experience with SaaS products running 24/7 on major cloud vendors.
    Familiar with Serverless Architecture: experience with serverless architecture on AWS.
    Understand FinTech: knowledge of the Fintech Industry and its unique challenges

        `,
        },
      ],
    });

    const responseContext = response.message.content;
    return JSON.parse(responseContext);
  }
}
