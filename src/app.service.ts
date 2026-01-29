import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { createWorker } from 'tesseract.js';
import { pdf } from 'pdf-to-img';
import path from 'path/posix';

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

    return fullTextArray;
  }
}
