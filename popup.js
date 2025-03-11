const DEBUG = true;
const SESSION_DURATION = 9 * 60 * 60 * 1000; // 설정 가능하도록 변수화
const otplib = require('otplib');
const jsQR = require('jsqr');
const CryptoJS = require('crypto-js');
import { encryptData, decryptData } from './encryption.js';

let deleteMode = false;
let encryptionPassword = null;

function log(...args) {
  if (DEBUG) console.log(...args);
}

log('popup.js 실행 시작');

// Base64 인코딩/디코딩 함수
function encodeToBase64(str) {
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(str);
  return btoa(String.fromCharCode(...uint8Array));
}

function decodeFromBase64(encoded) {
  const binaryStr = atob(encoded);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

// 해시 함수
function hashPassword(password, salt) {
  return CryptoJS.SHA256(password + salt).toString();
}

document.addEventListener('DOMContentLoaded', () => {
  log('DOM 로드 완료');
  const elements = {
    passwordModal: document.getElementById('passwordModal'),
    setPasswordBtn: document.getElementById('setPassword'),
    cancelPasswordBtn: document.getElementById('cancelPassword'),
    encryptionPasswordInput: document.getElementById('encryptionPassword'),
    uploadButton: document.querySelector('.upload-btn'),
    fileInput: document.getElementById('dataUpload'),
    searchInput: document.getElementById('searchInput'),
    addButton: document.querySelector('.add-btn'),
    deleteButton: document.querySelector('.delete-btn'),
    addModal: document.getElementById('addModal'),
    saveNewClientBtn: document.getElementById('saveNewClient'),
    closeModalBtn: document.getElementById('closeModal'),
    qrUploadButton: document.getElementById('uploadQrBtn'),
    qrFileInput: document.getElementById('qrUpload'),
    togglePasswordBtn: document.getElementById('togglePassword'),
  };

  // 요소 존재 여부 체크
  Object.entries(elements).forEach(([key, value]) => {
    if (!value) log(`Error: ${key} 요소를 찾을 수 없습니다.`);
  });

  // 초기 모달 상태 설정
  if (elements.passwordModal) elements.passwordModal.style.display = 'none';
  if (elements.addModal) elements.addModal.style.display = 'none';

  // 이벤트 리스너 설정 (중복 방지)
  const addEventListenerOnce = (element, event, handler) => {
    element?.removeEventListener(event, handler); // 기존 리스너 제거
    element?.addEventListener(event, handler);
  };

  addEventListenerOnce(elements.uploadButton, 'click', () => elements.fileInput.click());
  addEventListenerOnce(elements.fileInput, 'change', uploadData);
  addEventListenerOnce(elements.searchInput, 'input', () => loadClients(elements.searchInput.value.toLowerCase()));
  addEventListenerOnce(elements.addButton, 'click', handleAddButtonClick);
  addEventListenerOnce(elements.deleteButton, 'click', toggleDeleteMode);
  addEventListenerOnce(elements.qrUploadButton, 'click', () => elements.qrFileInput.click());
  addEventListenerOnce(elements.qrFileInput, 'change', handleQrUpload);

  // 비밀번호 모달 이벤트
  addEventListenerOnce(elements.setPasswordBtn, 'click', () => {
    log('확인 버튼 클릭');
    handleSetPassword(elements);
  });
  addEventListenerOnce(elements.cancelPasswordBtn, 'click', () => {
    log('취소 버튼 클릭');
    elements.passwordModal.style.display = 'none';
    elements.addModal.style.display = 'none'; // 취소 시 모든 모달 닫기
  });
  addEventListenerOnce(elements.encryptionPasswordInput, 'keydown', (e) => {
    if (e.key === 'Enter') elements.setPasswordBtn.click();
    if (e.key === 'Escape') elements.cancelPasswordBtn.click();
  });
  addEventListenerOnce(elements.togglePasswordBtn, 'click', () => {
    const input = elements.encryptionPasswordInput;
    input.type = input.type === 'password' ? 'text' : 'password';
    elements.togglePasswordBtn.querySelector('i').classList.toggle('fa-eye');
    elements.togglePasswordBtn.querySelector('i').classList.toggle('fa-eye-slash');
  });

  // 새 계정 추가 모달 이벤트
  addEventListenerOnce(elements.saveNewClientBtn, 'click', () => {
    log('saveNewClientBtn 클릭됨');
    saveNewClientHandler();
  });
  addEventListenerOnce(elements.closeModalBtn, 'click', () => {
    log('closeModalBtn 클릭됨');
    elements.addModal.style.display = 'none';
  });

  // 초기 로드
  initializeSession(elements);

  function saveNewClientHandler() {
    log('saveNewClientHandler 실행 시작');
    const name = document.getElementById('addName')?.value?.trim();
    const account = document.getElementById('addAccount')?.value?.trim();
    const username = document.getElementById('addUsername')?.value?.trim();
    const password = document.getElementById('addPassword')?.value?.trim();
    const mfaSecret = document.getElementById('addMfaSecret')?.value?.trim();

    log('입력값:', { name, account, username, password, mfaSecret });

    if (!name || !account || !username || !password || !mfaSecret) {
      alert('모든 필드를 입력해주세요.');
      log('입력값 누락으로 저장 중단');
      return;
    }

    chrome.storage.local.get(['encodedClients'], (result) => {
      let clients = [];
      if (result.encodedClients) {
        try {
          const decodedData = decodeFromBase64(result.encodedClients);
          const decryptedData = decryptData(decodedData, encryptionPassword);
          if (decryptedData) clients = JSON.parse(decryptedData);
        } catch (e) {
          log('복호화 실패:', e);
          alert('데이터 복호화 중 오류 발생: ' + e.message);
          return;
        }
      }
      clients.push({ name, account, username, password, mfaSecret });
      try {
        const jsonData = JSON.stringify(clients);
        const encryptedData = encryptData(jsonData, encryptionPassword);
        const encodedData = encodeToBase64(encryptedData);
        chrome.storage.local.set({ encodedClients: encodedData }, () => {
          log('새 계정 저장 완료');
          elements.addModal.style.display = 'none';
          elements.passwordModal.style.display = 'none'; // 추가로 비밀번호 모달 닫기
          loadClients();
        });
      } catch (e) {
        log('저장 중 오류:', e);
        alert('계정 저장 중 오류 발생: ' + e.message);
      }
    });
  }

  function initializeSession(elements) {
    chrome.storage.local.get(['session', 'encodedClients', 'salt'], (result) => {
      const session = result.session || {};
      const hasData = !!result.encodedClients;
      const salt = result.salt || CryptoJS.lib.WordArray.random(16).toString();

      log('초기 데이터:', { session, hasData, salt });

      if (session.password && session.passwordSetTimestamp && session.hashedPassword) {
        const sessionAge = Date.now() - session.passwordSetTimestamp;
        if (sessionAge < SESSION_DURATION && hashPassword(session.password, salt) === session.hashedPassword) {
          encryptionPassword = session.password;
          log('세션 유효, 비밀번호 유지');
          elements.passwordModal.style.display = 'none';
          elements.addModal.style.display = 'none'; // 초기 로드 시 새 계정 추가 창 닫기
          loadClients();
        } else {
          log('세션 만료 또는 비밀번호 불일치');
          chrome.storage.local.remove('session', () => log('세션 제거'));
          showPasswordModal(elements);
        }
      } else {
        showPasswordModal(elements);
      }
    });
  }

  function showPasswordModal(elements) {
    log('비밀번호 모달 표시');
    elements.passwordModal.style.display = 'block';
    elements.addModal.style.display = 'none'; // 비밀번호 입력 창이 열릴 때 새 계정 추가 창 닫기
    elements.encryptionPasswordInput.focus();
    const modalTitle = elements.passwordModal.querySelector('h3');
    if (modalTitle) {
      modalTitle.textContent = '암호화 비밀번호 등록';
      modalTitle.style.color = '#333';
    }
  }

  function handleSetPassword(elements) {
    log('handleSetPassword 시작');
    const password = elements.encryptionPasswordInput.value;
    if (!password) {
      alert('비밀번호를 입력하세요.');
      return;
    }

    chrome.storage.local.get(['encodedClients', 'session', 'salt'], (result) => {
      const hasData = !!result.encodedClients;
      const salt = result.salt || CryptoJS.lib.WordArray.random(16).toString();
      const hashedPassword = hashPassword(password, salt);

      encryptionPassword = password;

      if (!hasData) {
        const initialData = encryptData(JSON.stringify([]), password);
        chrome.storage.local.set({
          session: { password, hashedPassword, passwordSetTimestamp: Date.now() },
          salt,
          encodedClients: encodeToBase64(initialData)
        }, () => {
          log('초기 데이터 설정 완료');
          elements.passwordModal.style.display = 'none';
          elements.addModal.style.display = 'none'; // 모든 모달 닫기
          loadClients();
        });
      } else {
        try {
          const decrypted = decryptData(decodeFromBase64(result.encodedClients), password);
          if (decrypted && JSON.parse(decrypted)) {
            chrome.storage.local.set({
              session: { password, hashedPassword, passwordSetTimestamp: Date.now() },
              salt
            }, () => {
              log('세션 갱신 완료');
              elements.passwordModal.style.display = 'none';
              elements.addModal.style.display = 'none'; // 모든 모달 닫기
              loadClients();
            });
          } else {
            throw new Error('복호화 실패');
          }
        } catch (e) {
          log('비밀번호 인증 실패:', e);
          alert(`비밀번호가 올바르지 않습니다: ${e.message}`);
          encryptionPassword = null;
          elements.encryptionPasswordInput.value = '';
          elements.encryptionPasswordInput.focus();
        }
      }
    });
  }

  function loadClients(searchQuery = '') {
    chrome.storage.local.get(['session', 'encodedClients', 'salt'], (result) => {
      const session = result.session || {};
      const salt = result.salt;

      if (!encryptionPassword || !session.hashedPassword || hashPassword(encryptionPassword, salt) !== session.hashedPassword || (Date.now() - session.passwordSetTimestamp) >= SESSION_DURATION) {
        log('세션 없음, 비밀번호 입력 창 표시');
        document.getElementById('passwordModal').style.display = 'block';
        document.getElementById('addModal').style.display = 'none'; // 비밀번호 입력 창이 열릴 때 새 계정 추가 창 닫기
        const modalTitle = document.getElementById('passwordModal').querySelector('h3');
        if (modalTitle) {
          modalTitle.textContent = '암호화 비밀번호 등록';
          modalTitle.style.color = '#333';
        }
        return;
      }

      let clients = [];
      try {
        const decryptedData = decryptData(decodeFromBase64(result.encodedClients), encryptionPassword);
        clients = decryptedData ? JSON.parse(decryptedData) : [];
      } catch (e) {
        log('데이터 복호화 실패:', e);
        alert(`데이터 로드 실패: ${e.message}`);
        return;
      }

      if (searchQuery) {
        clients = clients.filter(client =>
          client.name.toLowerCase().includes(searchQuery) || client.account.toLowerCase().includes(searchQuery)
        );
      }

      const list = document.querySelector('.list-group');
      if (!list) {
        log('Error: .list-group 요소를 찾을 수 없습니다.');
        return;
      }

      list.innerHTML = clients.length ? clients.map(client => `
        <li class="list-group-item">
          <div class="row row-name">
            <div class="col col-checkbox" style="display: ${deleteMode ? 'block' : 'none'};">
              <input type="checkbox" class="delete-checkbox" data-account="${client.account}">
            </div>
            <div class="col col-name" data-account="${client.account}" data-field="name">
              <i class="fas fa-user-shield"></i>
              <span>${client.name}</span>
              <input type="text" value="${client.name}" style="display: none;">
            </div>
            <div class="col col-account" data-account="${client.account}" data-field="account">
              <span>${client.account}</span>
              <input type="text" value="${client.account}" style="display: none;">
            </div>
          </div>
          <div class="row row-details">
            <div class="col col-credentials">
              <div class="credential-item" data-account="${client.account}" data-field="username">
                <span>${client.username}</span>
                <input type="text" value="${client.username}" style="display: none;">
              </div>
              <div class="credential-item" data-account="${client.account}" data-field="password">
                <span>••••••••</span>
                <input type="text" value="${client.password}" style="display: none;">
              </div>
            </div>
            <div class="col col-mfa">
              <button class="btn-mfa" data-mfa="${client.mfaSecret}">MFA</button>
            </div>
            <div class="col col-login">
              <button class="btn-login" data-name="${client.name}" data-account="${client.account}" data-username="${client.username}" data-password="${client.password}" data-mfa="${client.mfaSecret}">
                <i class="fas fa-sign-in-alt"></i>
              </button>
            </div>
          </div>
        </li>
      `).join('') : '<li class="list-group-item">검색 결과가 없습니다.</li>';

      document.querySelectorAll('[data-field]').forEach(column => {
        column.addEventListener('click', (e) => editField(e.currentTarget, column.dataset.account, column.dataset.field));
        const input = column.querySelector('input');
        input.addEventListener('blur', () => saveField(input, column.dataset.account, column.dataset.field));
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      });
      document.querySelectorAll('.btn-mfa').forEach(button => {
        button.addEventListener('click', () => copyMfa(button.dataset.mfa));
      });
      document.querySelectorAll('.btn-login').forEach(button => {
        button.addEventListener('click', () => startLogin(button.dataset.name, button.dataset.account, button.dataset.username, button.dataset.password, button.dataset.mfa));
      });

      if (deleteMode) {
        document.querySelectorAll('.delete-checkbox').forEach(checkbox => {
          checkbox.addEventListener('change', (e) => {
            const item = e.target.closest('.list-group-item');
            item.classList.toggle('selected', e.target.checked);
          });
        });
      }

      updateButtonState();
    });
  }


  function editField(element, account, field) {
    const span = element.querySelector('span');
    const input = element.querySelector('input');
    span.style.display = 'none';
    input.style.display = 'block';
    input.focus();
  }

  function saveField(input, account, field) {
    const newValue = input.value;
    const span = input.parentElement.querySelector('span');
    span.textContent = field === 'password' ? '••••••••' : newValue;
    input.style.display = 'none';
    span.style.display = 'block';

    chrome.storage.local.get(['encodedClients', 'salt'], (result) => {
      let clients = [];
      if (result.encodedClients) {
        const decodedData = decodeFromBase64(result.encodedClients);
        try {
          const decryptedData = decryptData(decodedData, encryptionPassword);
          if (decryptedData) clients = JSON.parse(decryptedData);
        } catch (e) {
          log('복호화 실패:', e);
          clients = [];
        }
      }
      const client = clients.find(c => c.account === account);
      if (client) {
        client[field] = newValue;
        const jsonData = JSON.stringify(clients);
        const encryptedData = encryptData(jsonData, encryptionPassword);
        const encodedData = encodeToBase64(encryptedData);
        chrome.storage.local.set({ encodedClients: encodedData }, () => {
          log('데이터 저장 완료');
        });
      }
    });
  }

  function copyMfa(mfaSecret) {
    const mfaCode = otplib.authenticator.generate(mfaSecret);
    navigator.clipboard.writeText(mfaCode).then(() => {
      const notification = document.getElementById('notification');
      notification.textContent = 'MFA 코드가 복사되었습니다: ' + mfaCode;
      notification.classList.add('show');
      setTimeout(() => notification.classList.remove('show'), 2000);
    });
  }

  function startLogin(name, account, username, password, mfaSecret) {
    log('startLogin 호출:', { name, account, username, password, mfaSecret });
    chrome.runtime.sendMessage({
      action: 'login',
      data: { name, account, username, password, mfaSecret }
    });
  }

  function uploadData(event) {
    const file = event.target.files[0];
    log('업로드 파일:', file);
    if (!file || !file.name.toLowerCase().endsWith('.json')) {
      alert('JSON 파일을 선택해주세요.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        log('파일 읽기 완료:', e.target.result);
        const data = JSON.parse(e.target.result);
        if (!data.clients || !Array.isArray(data.clients)) {
          throw new Error('유효한 clients 배열이 없습니다.');
        }
        const jsonData = JSON.stringify(data.clients);
        log('JSON 데이터:', jsonData);
        const encryptedData = encryptData(jsonData, encryptionPassword);
        const encodedData = encodeToBase64(encryptedData);
        log('암호화 및 인코딩 완료:', encodedData);
        chrome.storage.local.set({ encodedClients: encodedData }, () => {
          log('데이터 저장 완료');
          alert('데이터 업로드가 성공적으로 완료되었습니다!');
          loadClients();
        });
      } catch (error) {
        log('업로드 오류:', error);
        alert('데이터 처리 중 오류가 발생했습니다: ' + error.message);
      }
    };
    reader.readAsText(file);
  }

  function toggleDeleteMode() {
    deleteMode = !deleteMode;
    loadClients();
  }

  function updateButtonState() {
    const deleteButton = document.querySelector('.delete-btn');
    const addButton = document.querySelector('.add-btn');
    const uploadButton = document.querySelector('.upload-btn');

    if (deleteMode) {
      deleteButton.innerHTML = '<i class="fas fa-check"></i>';
      deleteButton.title = '삭제 확인';
      deleteButton.removeEventListener('click', toggleDeleteMode);
      deleteButton.addEventListener('click', deleteSelectedClients);
      addButton.innerHTML = '<i class="fas fa-times"></i>';
      addButton.title = '삭제 취소';
      uploadButton.style.display = 'none';
    } else {
      deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
      deleteButton.title = '선택 삭제';
      deleteButton.removeEventListener('click', deleteSelectedClients);
      deleteButton.addEventListener('click', toggleDeleteMode);
      addButton.innerHTML = '<i class="fas fa-plus"></i>';
      addButton.title = '계정 추가';
      uploadButton.style.display = 'block';
    }
  }

  function deleteSelectedClients() {
    const checkboxes = document.querySelectorAll('.delete-checkbox:checked');
    if (checkboxes.length === 0) {
      alert('삭제할 계정을 선택해주세요.');
      return;
    }
    if (!confirm('선택한 계정을 삭제하시겠습니까?')) return;

    const accountsToDelete = Array.from(checkboxes).map(cb => cb.dataset.account);
    chrome.storage.local.get(['encodedClients'], (result) => {
      let clients = [];
      if (result.encodedClients) {
        const decodedData = decodeFromBase64(result.encodedClients);
        try {
          const decryptedData = decryptData(decodedData, encryptionPassword);
          if (decryptedData) clients = JSON.parse(decryptedData);
        } catch (e) {
          log('복호화 실패:', e);
          clients = [];
        }
      }
      clients = clients.filter(client => !accountsToDelete.includes(client.account));
      const jsonData = JSON.stringify(clients);
      const encryptedData = encryptData(jsonData, encryptionPassword);
      const encodedData = encodeToBase64(encryptedData);
      chrome.storage.local.set({ encodedClients: encodedData }, () => {
        deleteMode = false;
        document.getElementById('searchInput').value = '';
        loadClients();
      });
    });
  }

  function handleQrUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        
        if (code) {
          const mfaSecret = extractMfaSecret(code.data);
          if (mfaSecret) {
            document.getElementById('addMfaSecret').value = mfaSecret;
          } else {
            alert('QR 코드에서 MFA 비밀키를 추출할 수 없습니다.');
          }
        } else {
          alert('QR 코드를 인식할 수 없습니다.');
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function extractMfaSecret(qrData) {
    const match = qrData.match(/secret=([A-Za-z0-9]+)/);
    return match ? match[1] : null;
  }

  function handleAddButtonClick() {
    if (!deleteMode) {
      document.getElementById('addModal').style.display = 'block';
    } else {
      deleteMode = false;
      loadClients();
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'login') {
      const { name, account, username, password, mfaSecret } = message.data;

      const loginUrl = `https://${account}.signin.aws.amazon.com/console`;
      chrome.tabs.create({ url: loginUrl }, (tab) => {
        chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);

            const mfaCode = otplib.authenticator.generate(mfaSecret);

            setTimeout(() => {
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: autoLogin,
                args: [username, password, mfaCode]
              }, (results) => {
                if (chrome.runtime.lastError) {
                  log('스크립트 삽입 오류:', chrome.runtime.lastError);
                } else {
                  log('스크립트 삽입 성공');
                }
              });
            }, 1000);
          }
        });
      });
    }
  });

  function autoLogin(username, password, mfaCode) {
    const attemptLogin = () => {
      const usernameField = document.querySelector('#username');
      const passwordField = document.querySelector('#password');
      const signInButton = document.querySelector('#signin_button');

      if (usernameField && passwordField && signInButton) {
        usernameField.value = username;
        usernameField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.value = password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        signInButton.click();

        setTimeout(() => {
          const mfaField = document.querySelector('#mfaCode');
          const submitButton = document.querySelector('button[type="submit"]') || document.querySelector('#signin_button');
          if (mfaField && submitButton) {
            mfaField.value = mfaCode;
            mfaField.dispatchEvent(new Event('input', { bubbles: true }));
            submitButton.click();
          } else {
            log('MFA 필드 또는 제출 버튼을 찾을 수 없음');
          }
        }, 500);
      } else {
        log('로그인 필드를 찾을 수 없음');
        setTimeout(attemptLogin, 500);
      }
    };

    attemptLogin();
  }
});