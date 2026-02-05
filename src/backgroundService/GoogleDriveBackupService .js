import { GoogleSignin } from '@react-native-google-signin/google-signin';
import RNFS from 'react-native-fs';
import moment from 'moment';
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import { Buffer } from 'buffer';
import { getAllNotes, getAllNotesModifiedToday } from '../database/R';

// Cache for folder IDs to avoid repeated lookups
const folderCache = {};

export const initializeGoogleDrive = async () => {
  try {
    await GoogleSignin.hasPlayServices();
    const isSignedIn = await GoogleSignin.getCurrentUser();
    if (!isSignedIn) {
      await GoogleSignin.signIn();
    }
    return await GoogleSignin.getTokens();
  } catch (error) {
    console.error('Google Drive initialization failed:', error);
    throw error;
  }
};

const ensureFolderExists = async (accessToken, folderName, parentId = null) => {
  try {
    const cacheKey = parentId ? `${parentId}/${folderName}` : folderName;
    if (folderCache[cacheKey]) return folderCache[cacheKey];

    let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder'`;
    if (parentId) query += ` and '${parentId}' in parents`;

    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    const searchData = await searchResponse.json();
    if (!searchResponse.ok) {
      console.error('Search Error:', searchData);
      throw new Error(searchData.error?.message || 'Unknown search error');
    }

    const files = searchData.files || [];
    if (files.length > 0) {
      folderCache[cacheKey] = files[0].id;
      return files[0].id;
    }

    // Create folder if it doesn't exist
    const folderMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId && { parents: [parentId] }),
    };

    const createResponse = await fetch(
      'https://www.googleapis.com/drive/v3/files',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(folderMetadata),
      }
    );

    const newFolder = await createResponse.json();
    if (!createResponse.ok) {
      console.error('Create Error:', newFolder);
      throw new Error(newFolder.error?.message || 'Unknown create error');
    }

    folderCache[cacheKey] = newFolder.id;
    return newFolder.id;
  } catch (err) {
    console.error('ensureFolderExists error:', err);
    throw err;
  }
};


const createHTMLForNote = async (note) => {
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${note.noteTitle || 'Untitled Note'}</title>
      <meta charset="UTF-8" />
      <style>
        * {
          box-sizing: border-box;
        }

        html, body {
          margin: 0;
          padding: 0;
          font-family: 'Georgia', serif;
          background: #fff;
          color: #333;
          font-size: 16px;
          line-height: 1.8;
        }

        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 40px 30px;
        }

        h1 {
          font-size: 28px;
          font-weight: bold;
          color: #2c3e50;
          border-bottom: 2px solid #ecf0f1;
          padding-bottom: 10px;
          margin-bottom: 30px;
        }

        p {
          margin: 20px 0;
          white-space: pre-wrap;
        }

        .timestamp {
          display: inline-block;
          background-color: #f0f9ff;
          color: #007acc;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 14px;
          margin: 10px 0;
          font-style: italic;
        }

        img {
          display: block;
          max-width: 100%;
          margin: 30px auto;
          border-radius: 8px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }

        footer {
          border-top: 1px solid #ccc;
          margin-top: 50px;
          padding-top: 20px;
          font-size: 13px;
          color: #888;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${note.noteTitle || 'Untitled Note'}</h1>
  `;

  for (const item of note.noteContent) {
    if (item.type === 'text') {
      html += `<p>${item.content.replace(/\n/g, '<br>')}</p>`;
    } else if (item.type === 'image') {
      try {
        const base64Image = await RNFS.readFile(item.content, 'base64');
        html += `<img src="data:image/jpeg;base64,${base64Image}" alt="note image" />`;
      } catch (e) {
        console.warn(`Could not read image ${item.content}:`, e);
      }
    } else if (item.type === 'timestamp') {
      html += `<span class="timestamp">${item.content}</span>`;
    }
  }

  html += `
        <footer>
          Last updated: ${new Date(note.updatedAt || note.created_at).toLocaleString()}
        </footer>
      </div>
    </body>
    </html>
  `;

  return html;
};


export const backupNoteToGoogleDrive = async (note, dayFolderId, accessToken) => {
  try {
    console.log(`[Backup] Starting backup for note: "${note.noteTitle || 'Untitled Note'}"`);

    const fileName = `${note.noteTitle || 'Untitled Note'}.pdf`;
    const pdfPath = await convertToPdf(note, fileName);
    console.log(`[Backup] PDF generated at: ${pdfPath}`);

    const fileExistsQuery = `name='${fileName}' and '${dayFolderId}' in parents`;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(fileExistsQuery)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const { files } = await searchRes.json();
    const fileId = files.length > 0 ? files[0].id : null;

    const fileData = await RNFS.readFile(pdfPath, 'base64');
    const boundary = '-------' + Math.random().toString(36).substring(2);
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = fileId
      ? { name: fileName, mimeType: 'application/pdf' }
      : { name: fileName, mimeType: 'application/pdf', parents: [dayFolderId] };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/pdf\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      fileData +
      closeDelimiter;

    const uploadUrl = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

    const uploadRes = await fetch(uploadUrl, {
      method: fileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    const uploaded = await uploadRes.json();

    await fetch(
      `https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      }
    );

    const linkRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${uploaded.id}?fields=webViewLink`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const { webViewLink } = await linkRes.json();
    const webViewLinkWithCacheBust = `${webViewLink}?v=${Date.now()}`;

    return {
      success: true,
      fileId: uploaded.id,
      shareableLink: webViewLinkWithCacheBust,
    };
  } catch (error) {
    console.error('[Backup] Error during backup process:', error);
    return { success: false, error: error.message };
  }
};

export const backupAllNotes = async () => {
  try {
    const notes = await getAllNotesModifiedToday();
    const { accessToken } = await initializeGoogleDrive();

    const folderCache = new Map(); // key = 'YYYY/MMMM/DD', value = dayFolderId
    const rootFolderId = await ensureFolderExists(accessToken, 'NotesBackup');

    const results = [];

    for (const note of notes) {
      const date = moment(note.updatedAt || note.createdAt);
      const folderKey = date.format('YYYY/MMMM/DD');

      let dayFolderId = folderCache.get(folderKey);

      if (!dayFolderId) {
        const yearFolderId = await ensureFolderExists(accessToken, date.format('YYYY'), rootFolderId);
        const monthFolderId = await ensureFolderExists(accessToken, date.format('MMMM'), yearFolderId);
        dayFolderId = await ensureFolderExists(accessToken, date.format('DD'), monthFolderId);
        folderCache.set(folderKey, dayFolderId);
      }

      const result = await backupNoteToGoogleDrive(note, dayFolderId, accessToken);
      results.push({ noteId: note.id, ...result });
    }

    return {
      success: true,
      backedUpCount: results.filter(r => r.success).length,
      failedCount: results.filter(r => !r.success).length,
      results,
    };
  } catch (error) {
    console.error('Failed to backup all notes:', error);
    return { success: false, error: error.message };
  }
};


export const convertToPdf = async (notes, fileName = `notes_${Date.now()}`) => {
  try {
   
htmlContent = await createHTMLForNote(notes)
    const options = {
      html: htmlContent,
      fileName,
      directory: 'Documents',
    };

    const file = await RNHTMLtoPDF.convert(options);
    return file.filePath;
  } catch (error) {
    console.error('Error creating PDF:', error);
    throw error;
  }
};




