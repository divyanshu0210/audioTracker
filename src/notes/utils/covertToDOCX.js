import RNFS from 'react-native-fs';
import { Document, Packer, Paragraph, TextRun, ImageRun } from 'docx';
import { Alert } from 'react-native';
import { Buffer } from 'buffer';
import Share from 'react-native-share';
import { openAsBlob } from 'fs';

global.Buffer = Buffer; // Ensure Buffer works in React Native

export const convertToDocx = async (notes) => {
  try {
    const children = [];

    for (const note of notes) {
      if (note.type === 'text') {
        children.push(
          new Paragraph({
            children: [new TextRun(note.content)],
            spacing: { after: 200 },
          })
        );
      } else if (note.type === 'image') {
        try {
          const imageData = await RNFS.readFile(note.content, 'base64');
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: Buffer.from(imageData, 'base64'),
                  transformation: { width: 300, height: 200 },
                }),
              ],
              spacing: { after: 200 },
            })
          );
        } catch (imageError) {
          console.warn('Failed to add image:', imageError);
        }
      }
    }

    const doc = new Document({
      sections: [{ children }],
    });

    const buffer = await Packer.toBuffer(doc);
    const filePath = `${RNFS.ExternalDirectoryPath}/notes_${Date.now()}.docx`;
    console.log(filePath)
    await RNFS.writeFile(filePath, buffer.toString('base64'), 'base64');

return filePath;

  } catch (error) {
    console.error('Error creating DOCX:', error);
    Alert.alert('Error', 'Failed to create DOCX file');
  }
};
