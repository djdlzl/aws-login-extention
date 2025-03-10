const otplib = require('otplib');
const jsQR = require('jsqr');
const CryptoJS = require('crypto-js');

let deleteMode = false;

console.log('popup.js 실행 시작');

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

// 암호화/복호화 함수
function encryptData(data) {
  if (!encryptionPassword) throw new Error('암호화 비밀번호가 설정되지 않았습니다.');
  return CryptoJS.AES.encrypt(data, encryptionPassword).toString();
}

function decryptData(encryptedData) {
  if (!encryptionPassword) throw new Error('암호화 비밀번호가 필요합니다.');
  const bytes = CryptoJS.AES.decrypt(encryptedData, encryptionPassword);
  const decrypted = bytes.toString(CryptoJS.enc.Utf8);
  return decrypted || null;
}

// 전역 변수로 모달 관련 요소 정의
const passwordModal = document.getElementById('passwordModal');
const setPasswordBtn = document.getElementById('setPassword');
const cancelPasswordBtn = document.getElementById('cancelPassword');
const encryptionPasswordInput = document.getElementById('encryptionPassword');

// 초기 비밀번호 설정
let encryptionPassword = null;

// 해시 함수
function hashPassword(password, salt) {
  return CryptoJS.SHA256(password + salt).toString();
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM 로드 완료');
  const uploadButton = document.querySelector('.upload-btn');
  const fileInput = document.getElementById('dataUpload');
  const searchInput = document.getElementById('searchInput');
  const addButton = document.querySelector('.add-btn');
  const deleteButton = document.querySelector('.delete-btn');
  const addModal = document.getElementById('addModal');
  const saveNewClientBtn = document.getElementById('saveNewClient');
  const closeModalBtn = document.getElementById('closeModal');
  const qrUploadButton = document.getElementById('uploadQrBtn');
  const qrFileInput = document.getElementById('qrUpload');

  if (!passwordModal) {
    console.error('passwordModal 요소를 찾을 수 없습니다.');
    return;
  }

  if (!saveNewClientBtn || !closeModalBtn) {
    console.error('saveNewClient 또는 closeModal 버튼을 찾을 수 없습니다.');
    return;
  }

  if (uploadButton && fileInput) {
    uploadButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', uploadData);
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase();
      console.log('검색어 입력:', query);
      loadClients(query);
    });
  }

  if (addButton && addModal) {
    addButton.addEventListener('click', handleAddButtonClick);
  }

  if (deleteButton) {
    deleteButton.addEventListener('click', toggleDeleteMode);
  }

  if (qrUploadButton && qrFileInput) {
    qrUploadButton.addEventListener('click', () => qrFileInput.click());
    qrFileInput.addEventListener('change', handleQrUpload);
  }

  if (passwordModal && setPasswordBtn && cancelPasswordBtn) {
    setPasswordBtn.addEventListener('click', () => {
      console.log('setPasswordBtn 클릭 시작');
      const password = encryptionPasswordInput.value;

      console.log('입력값:', { password });

      chrome.storage.local.get(['encodedClients', 'session', 'salt'], (result) => {
        const hasData = !!result.encodedClients;
        const existingSession = result.session || {};
        let salt = result.salt;
        if (!salt) {
          salt = CryptoJS.lib.WordArray.random(16).toString();
          chrome.storage.local.set({ salt: salt }, () => console.log('새 솔트 생성:', salt));
        }
        console.log('초기 데이터 상태:', { hasData, existingSession, salt });

        if (!password) {
          alert('비밀번호를 입력하세요.');
          return;
        }

        const hashedPassword = hashPassword(password, salt);
        encryptionPassword = password;

        if (!hasData) {
          chrome.storage.local.set(
            {
              session: {
                password: password,
                hashedPassword: hashedPassword,
                passwordSetTimestamp: Date.now()
              },
              salt: salt
            },
            () => {
              console.log('세션 데이터 및 솔트 저장 완료');
              chrome.storage.local.set(
                { encodedClients: encodeToBase64(encryptData(JSON.stringify([]))) },
                () => {
                  console.log('초기 데이터 설정 완료');
                  passwordModal.style.display = 'none';
                  loadClients();
                }
              );
            }
          );
        } else {
          chrome.storage.local.get(['encodedClients'], (result) => {
            const encodedData = result.encodedClients;
            const decodedData = decodeFromBase64(encodedData);
            try {
              const decryptedData = decryptData(decodedData);
              if (decryptedData) {
                JSON.parse(decryptedData);
                if (hashPassword(password, salt) === existingSession.hashedPassword) {
                  chrome.storage.local.set(
                    {
                      session: {
                        password: password,
                        hashedPassword: hashedPassword,
                        passwordSetTimestamp: Date.now()
                      },
                      salt: salt
                    },
                    () => {
                      console.log('세션 데이터 갱신 완료');
                      encryptionPassword = password;
                      passwordModal.style.display = 'none';
                      loadClients();
                    }
                  );
                } else {
                  throw new Error('비밀번호 불일치');
                }
              } else {
                throw new Error('복호화 실패');
              }
            } catch (e) {
              console.error('비밀번호 인증 실패:', e);
              alert('비밀번호가 올바르지 않습니다.');
              encryptionPassword = null;
              encryptionPasswordInput.value = '';
              encryptionPasswordInput.focus();
            }
          });
        }
      });
    });

    cancelPasswordBtn.addEventListener('click', () => {
      passwordModal.style.display = 'none';
    });

    encryptionPasswordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        setPasswordBtn.click();
      } else if (e.key === 'Escape') {
        cancelPasswordBtn.click();
      }
    });
  }

  saveNewClientBtn.addEventListener('click', () => {
    console.log('saveNewClientBtn 클릭');
    saveNewClientHandler();
  });

  closeModalBtn.addEventListener('click', () => {
    console.log('closeModalBtn 클릭');
    addModal.style.display = 'none';
  });

  chrome.storage.local.get(['session', 'encodedClients', 'salt'], (result) => {
    const session = result.session;
    const hasData = !!result.encodedClients;
    const salt = result.salt || CryptoJS.lib.WordArray.random(16).toString();

    console.log('로드된 데이터:', { session, hasData, salt });

    if (session && session.password && session.passwordSetTimestamp && session.hashedPassword) {
      const now = Date.now();
      const sessionAge = now - session.passwordSetTimestamp;
      const sessionDuration = 9 * 60 * 60 * 1000;

      console.log('세션 상태:', { now, passwordSetTimestamp: session.passwordSetTimestamp, sessionAge, sessionDuration });

      if (sessionAge < sessionDuration) {
        if (hashPassword(session.password, salt) === session.hashedPassword) {
          encryptionPassword = session.password;
          console.log('세션 유효, 비밀번호 유지:', encryptionPassword);
          passwordModal.style.display = 'none';
          loadClients();
        } else {
          console.error('세션 비밀번호 불일치');
          passwordModal.style.display = 'block';
          encryptionPasswordInput.focus();
        }
      } else {
        console.log('세션 만료, 비밀번호 재입력 요청');
        passwordModal.style.display = 'block';
        encryptionPasswordInput.focus();
      }
    } else {
      passwordModal.style.display = 'block';
      passwordModal.style.visibility = 'visible';
      encryptionPasswordInput.focus();
    }
  });
});

function loadClients(searchQuery = '') {
  chrome.storage.local.get(['session', 'encodedClients', 'salt'], (result) => {
    const session = result.session;
    const hasData = !!result.encodedClients;
    const salt = result.salt || CryptoJS.lib.WordArray.random(16).toString();

    console.log('loadClients - 데이터:', { session, hasData, salt });

    if (session && session.password && session.passwordSetTimestamp && session.hashedPassword) {
      const now = Date.now();
      const sessionAge = now - session.passwordSetTimestamp;
      const sessionDuration = 9 * 60 * 60 * 1000;

      console.log('loadClients - 세션 상태:', { now, passwordSetTimestamp: session.passwordSetTimestamp, sessionAge, sessionDuration });

      if (sessionAge >= sessionDuration) {
        console.log('세션 만료');
      }

      if (!encryptionPassword || hashPassword(encryptionPassword, salt) !== session.hashedPassword || sessionAge >= sessionDuration) {
        passwordModal.style.display = 'block';
        passwordModal.style.visibility = 'visible';
        encryptionPasswordInput.focus();
        return;
      }
    } else if (!hasData) {
      passwordModal.style.display = 'block';
      passwordModal.style.visibility = 'visible';
      encryptionPasswordInput.focus();
      return;
    } else {
      passwordModal.style.display = 'block';
      passwordModal.style.visibility = 'visible';
      encryptionPasswordInput.focus();
      return;
    }

    chrome.storage.local.get(['encodedClients'], (result) => {
      let clients = [];
      console.log('loadClients - 저장된 데이터:', result.encodedClients);
      if (result.encodedClients) {
        const decodedData = decodeFromBase64(result.encodedClients);
        try {
          console.log('복호화 시도, 비밀번호:', encryptionPassword);
          const decryptedData = decryptData(decodedData);
          if (decryptedData) {
            clients = JSON.parse(decryptedData);
            console.log('loadClients - 데이터 복호화 성공:', clients);
          } else {
            throw new Error('복호화 데이터 없음');
          }
        } catch (e) {
          console.error('loadClients - 데이터 복호화 실패:', e);
          alert('비밀번호가 틀렸습니다. 다시 입력해주세요. 오류: ' + e.message);
          encryptionPassword = null;
          passwordModal.style.display = 'block';
          passwordModal.style.visibility = 'visible';
          encryptionPasswordInput.value = '';
          encryptionPasswordInput.focus();
          return;
        }
      } else {
        console.log('loadClients - 저장된 데이터 없음, 빈 목록 표시');
      }

      // 검색어로 필터링
      if (searchQuery) {
        clients = clients.filter(client =>
          client.name.toLowerCase().includes(searchQuery) ||
          client.account.toLowerCase().includes(searchQuery)
        );
        console.log('필터링된 클라이언트:', clients);
      }

      const list = document.querySelector('.list-group');
      if (!list) {
        console.error('loadClients - list-group 요소를 찾을 수 없습니다.');
        return;
      }

      // 검색 결과가 없을 경우 메시지 표시
      if (clients.length === 0) {
        list.innerHTML = '<li class="list-group-item">검색 결과가 없습니다.</li>';
      } else {
        list.innerHTML = clients.map(client => `
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
        `).join('');
      }

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
        const decryptedData = decryptData(decodedData);
        if (decryptedData) clients = JSON.parse(decryptedData);
      } catch (e) {
        console.error('복호화 실패:', e);
        clients = [];
      }
    }
    const client = clients.find(c => c.account === account);
    if (client) {
      client[field] = newValue;
      const jsonData = JSON.stringify(clients);
      const encryptedData = encryptData(jsonData);
      const encodedData = encodeToBase64(encryptedData);
      chrome.storage.local.set({ encodedClients: encodedData }, () => {
        console.log('데이터 저장 완료');
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
  console.log('startLogin 호출:', { name, account, username, password, mfaSecret });
  chrome.runtime.sendMessage({
    action: 'login',
    data: { name, account, username, password, mfaSecret }
  });
}

function uploadData(event) {
  const file = event.target.files[0];
  console.log('업로드 파일:', file);
  if (!file || !file.name.toLowerCase().endsWith('.json')) {
    alert('JSON 파일을 선택해주세요.');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      console.log('파일 읽기 완료:', e.target.result);
      const data = JSON.parse(e.target.result);
      const jsonData = JSON.stringify(data.clients);
      console.log('JSON 데이터:', jsonData);
      const encryptedData = encryptData(jsonData);
      const encodedData = encodeToBase64(encryptedData);
      console.log('암호화 및 인코딩 완료:', encodedData);
      chrome.storage.local.set({ encodedClients: encodedData }, () => {
        console.log('데이터 저장 완료');
        loadClients();
      });
    } catch (error) {
      console.error('업로드 오류:', error);
      alert('데이터 처리 중 오류가 발생했습니다: ' + error.message);
    }
  };
  reader.readAsText(file);
}

function saveNewClientHandler() {
  console.log('saveNewClientHandler 실행');
  const name = document.getElementById('addName').value;
  const account = document.getElementById('addAccount').value;
  const username = document.getElementById('addUsername').value;
  const password = document.getElementById('addPassword').value;
  const mfaSecret = document.getElementById('addMfaSecret').value;

  console.log('입력값:', { name, account, username, password, mfaSecret });

  if (!name || !account || !username || !password || !mfaSecret) {
    alert('모든 필드를 입력해주세요.');
    return;
  }

  chrome.storage.local.get(['encodedClients'], (result) => {
    let clients = [];
    if (result.encodedClients) {
      const decodedData = decodeFromBase64(result.encodedClients);
      try {
        const decryptedData = decryptData(decodedData);
        if (decryptedData) clients = JSON.parse(decryptedData);
      } catch (e) {
        console.error('복호화 실패:', e);
        clients = [];
      }
    }
    clients.push({ name, account, username, password, mfaSecret });
    const jsonData = JSON.stringify(clients);
    const encryptedData = encryptData(jsonData);
    const encodedData = encodeToBase64(encryptedData);
    chrome.storage.local.set({ encodedClients: encodedData }, () => {
      console.log('새 계정 저장 완료');
      document.getElementById('addModal').style.display = 'none';
      loadClients();
    });
  });
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
        const decryptedData = decryptData(decodedData);
        if (decryptedData) clients = JSON.parse(decryptedData);
      } catch (e) {
        console.error('복호화 실패:', e);
        clients = [];
      }
    }
    clients = clients.filter(client => !accountsToDelete.includes(client.account));
    const jsonData = JSON.stringify(clients);
    const encryptedData = encryptData(jsonData);
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

          const otplib = require('otplib');
          const mfaCode = otplib.authenticator.generate(mfaSecret);

          setTimeout(() => {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: autoLogin,
              args: [username, password, mfaCode]
            }, (results) => {
              if (chrome.runtime.lastError) {
                console.error('스크립트 삽입 오류:', chrome.runtime.lastError);
              } else {
                console.log('스크립트 삽입 성공');
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
          console.error('MFA 필드 또는 제출 버튼을 찾을 수 없음');
        }
      }, 500);
    } else {
      console.error('로그인 필드를 찾을 수 없음');
      setTimeout(attemptLogin, 500);
    }
  };

  attemptLogin();
}