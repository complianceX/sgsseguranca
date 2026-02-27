import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const mailService = {
  async sendStoredDocument(documentId: string, documentType: string, email: string) {
    const token = localStorage.getItem('token');
    const response = await axios.post(
      `${API_URL}/mail/send-stored-document`,
      { documentId, documentType, email },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  },
};