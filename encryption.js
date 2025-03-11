// encryption.js
const CryptoJS = require('crypto-js');

export function encryptData(data, password) {
  if (!password) throw new Error('암호화 비밀번호가 필요합니다.');
  return CryptoJS.AES.encrypt(data, password).toString();
}

export function decryptData(encryptedData, password) {
  if (!password) throw new Error('복호화 비밀번호가 필요합니다.');
  const bytes = CryptoJS.AES.decrypt(encryptedData, password);
  return bytes.toString(CryptoJS.enc.Utf8) || null;
}