const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

const API_KEY = 'sk_53a73490b36e096ee88cb7c09fe26c378362e661ef6f5afe'; // paste your sk_... key here temporarily for testing only

async function testSTT() {
  const audioFilePath = './test-audio.mp3'; // make sure this file exists in the same folder

  const formData = new FormData();
  formData.append('file', fs.createReadStream(audioFilePath));
  formData.append('model_id', 'scribe_v1');

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      ...formData.getHeaders()
    },
    body: formData
  });

  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Full response:', JSON.stringify(data, null, 2));
}

testSTT();