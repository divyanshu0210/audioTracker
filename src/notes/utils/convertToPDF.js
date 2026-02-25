import RNHTMLtoPDF from 'react-native-html-to-pdf';
import {Alert} from 'react-native';
import {getImagesForNote, getNoteById} from '../richDB';

export const convertToPdf = async noteId => {
  try {
    if (!noteId) {
      Alert.alert('Error', 'Invalid note');
      return;
    }

    const note = await getNoteById(noteId);
    if (!note) {
      Alert.alert('Error', 'Note not found');
      return;
    }

    // 1️⃣ Get all stored images
const images = await getImagesForNote(noteId);
let processedContent = note.content;

images.forEach(img => {
  if (!img?.id || !img?.image_data) return;

  const regex = new RegExp(
    `<img[\\s\\S]*?data-image-id=["']${img.id}["'][\\s\\S]*?>`,
    'gi'
  );

  processedContent = processedContent.replace(
    regex,
    `<img src="${img.image_data}" style="max-width:100%; margin:20px 0;" />`
  );
});


    // 3️⃣ Remove editor-only attributes
    processedContent = processedContent
      .replace(/contenteditable="false"/g, '')
      .replace(/onclick="[^"]*"/g, '');

    // 4️⃣ Remove invisible spacer buttons
    processedContent = processedContent.replace(
      /<button[^>]*>\.<\/button>/g,
      '',
    );

    // 5️⃣ Convert timestamp buttons to styled spans (static)
    processedContent = processedContent.replace(
      /<button[^>]*>(.*?)<\/button>/g,
      `<span style="
          background:#e1f5fe;
          color:#0288d1;
          padding:4px 8px;
          border-radius:12px;
          font-weight:bold;
          font-size:12px;
          display:inline-block;
          margin:8px 0;
        ">$1</span>`,
    );

    const escapeHtml = str =>
      str
        ?.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const safeTitle = escapeHtml(note.title || 'Untitled Note');

    const htmlContent = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body {
              font-family: Helvetica, sans-serif;
              margin: 40px;
              line-height: 1.6;
              color: #333;
            }
            h1 {
              font-size: 24px;
              margin-bottom: 20px;
              border-bottom: 2px solid #eee;
              padding-bottom: 8px;
            }
            img {
              max-width: 100%;
              height: auto;
              display: block;
              margin: 20px auto;
            }
            p {
              font-size: 16px;
              margin-bottom: 16px;
            }
          </style>
        </head>
        <body>
          <h1>${safeTitle}</h1>
          ${processedContent}
        </body>
      </html>
    `;

    const options = {
      html: htmlContent,
      fileName: `note_${Date.now()}`,
      directory: 'Documents',
    };

    const file = await RNHTMLtoPDF.convert(options);

    return file.filePath;
  } catch (error) {
    console.error('PDF Export Error:', error);
    Alert.alert('Error', 'Failed to create PDF');
  }
};
