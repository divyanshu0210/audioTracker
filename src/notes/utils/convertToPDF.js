import RNHTMLtoPDF from 'react-native-html-to-pdf';
import RNFS from 'react-native-fs';
import {Alert} from 'react-native';
import Share from 'react-native-share';
import { getImagesForNote, getNoteById } from '../richDB';

export const convertToPdf = async noteId => {
  console.log(noteId)
  try {
    // if (!note?.rowid || !note?.content) {
    //   Alert.alert('Error', 'Invalid note data');
    //   return;
    // }  
    if (!noteId) {
      Alert.alert('Error', 'Invalid note data');
      return;
    }

    // Fetch associated images from DB
    const images = (await getImagesForNote(noteId)) || [];
    const imageMap = {};
    images.forEach(img => {
      if (img?.id && img?.image_data) {
        imageMap[img.id] = img.image_data; // Already base64 string with data:image/... prefix
      }
    });
    
    const note = await getNoteById(noteId);
    // Replace image placeholders in HTML content
    const contentWithImages = note.content.replace(
      /<img[^>]*data-image-id="([^"]*)"[^>]*>/g,
      (match, imageId) =>
        imageMap[imageId]
          ? `<img src="${imageMap[imageId]}" style="max-width:100%;">`
          : '', // skip missing images
    );

    const escapeHtml = str =>
  str?.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

const safeTitle = escapeHtml(note.title || 'Untitled Note');
    // Combine title and content
const htmlContent = `
  <html>
    <head>
      <meta charset="utf-8">
      <title>${safeTitle}</title>
      <style>
        body {
          font-family: 'Helvetica', sans-serif;
          margin: 40px;
          line-height: 1.6;
          color: #333;
        }
        h1 {
          font-size: 24px;
          margin-bottom: 20px;
          color: #222;
        }
        img {
          display: block;
          margin: 20px auto;
          max-width: 100%;
          height: auto;
        }
        p {
          font-size: 16px;
          margin-bottom: 16px;
        }
      </style>
    </head>
    <body>
      <h1>${safeTitle}</h1>
      ${contentWithImages}
    </body>
  </html>
`;


    // Create PDF
    const options = {
      html: htmlContent,
      fileName: `notes_${Date.now()}`,
      directory: 'Documents',
    };

    const file = await RNHTMLtoPDF.convert(options);
    console.log('PDF saved at:', file.filePath);

    return file.filePath;

    // // Share the PDF via WhatsApp
    // await Share.open({
    //   url: `file://${file.filePath}`,
    //   type: 'application/pdf',
    //   title: 'Share Notes PDF',
    //   social: Share.Social.WHATSAPP, // Share to WhatsApp
    // });
  } catch (error) {
    console.error('Error creating PDF:', error);
    Alert.alert('Error', 'Failed to create PDF file');
  }
};
