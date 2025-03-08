const otplib = require('otplib');
const jsQR = require('jsqr'); // QR 코드 인식 라이브러리

console.log('popup.js 실행 시작');

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

let deleteMode = false;

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM 로드 완료');
  const uploadButton = document.querySelector('.upload-btn');
  const fileInput = document.getElementById('dataUpload');
  const searchInput = document.getElementById('searchInput');
  const addButton = document.querySelector('.add-btn');
  const deleteButton = document.querySelector('.delete-btn');
  const addModal = document.getElementById('addModal');
  const saveNewClient = document.getElementById('saveNewClient');
  const closeModal = document.getElementById('closeModal');
  const qrUploadButton = document.getElementById('uploadQrBtn');
  const qrFileInput = document.getElementById('qrUpload');

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
    closeModal.addEventListener('click', () => {
      addModal.style.display = 'none';
    });
    saveNewClient.addEventListener('click', saveNewClientHandler);
  }

  if (deleteButton) {
    deleteButton.addEventListener('click', toggleDeleteMode);
  }

  if (qrUploadButton && qrFileInput) {
    qrUploadButton.addEventListener('click', () => qrFileInput.click());
    qrFileInput.addEventListener('change', handleQrUpload);
  }

  loadClients();
});

function handleAddButtonClick() {
  if (!deleteMode) {
    document.getElementById('addModal').style.display = 'block';
  } else {
    deleteMode = false;
    loadClients();
  }
}

function loadClients(searchQuery = '') {
  chrome.storage.local.get(['encodedClients'], (result) => {
    let clients = [];
    if (result.encodedClients) {
      const decodedData = decodeFromBase64(result.encodedClients);
      clients = JSON.parse(decodedData);
    }

    if (searchQuery) {
      clients = clients.filter(client => 
        client.name.toLowerCase().includes(searchQuery) || 
        client.account.toLowerCase().includes(searchQuery)
      );
    }

    const list = document.querySelector('.list-group');
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

  chrome.storage.local.get(['encodedClients'], (result) => {
    let clients = [];
    if (result.encodedClients) {
      const decodedData = decodeFromBase64(result.encodedClients);
      clients = JSON.parse(decodedData);
    }
    const client = clients.find(c => c.account === account);
    if (client) {
      client[field] = newValue;
      const encodedData = encodeToBase64(JSON.stringify(clients));
      chrome.storage.local.set({ encodedClients: encodedData });
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
  if (!file || !file.name.toLowerCase().endsWith('.json')) {
    alert('JSON 파일을 선택해주세요.');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const encodedData = encodeToBase64(JSON.stringify(data.clients));
      chrome.storage.local.set({ encodedClients: encodedData }, () => {
        console.log('데이터 업로드 및 저장 완료');
        loadClients();
      });
    } catch (error) {
      console.error('업로드 오류:', error);
      alert('데이터 처리 중 오류가 발생했습니다.');
    }
  };
  reader.readAsText(file);
}

function saveNewClientHandler() {
  const name = document.getElementById('addName').value;
  const account = document.getElementById('addAccount').value;
  const username = document.getElementById('addUsername').value;
  const password = document.getElementById('addPassword').value;
  const mfaSecret = document.getElementById('addMfaSecret').value;

  if (!name || !account || !username || !password || !mfaSecret) {
    alert('모든 필드를 입력해주세요.');
    return;
  }

  chrome.storage.local.get(['encodedClients'], (result) => {
    let clients = [];
    if (result.encodedClients) {
      const decodedData = decodeFromBase64(result.encodedClients);
      clients = JSON.parse(decodedData);
    }
    clients.push({ name, account, username, password, mfaSecret });
    const encodedData = encodeToBase64(JSON.stringify(clients));
    chrome.storage.local.set({ encodedClients: encodedData }, () => {
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
      clients = JSON.parse(decodedData);
    }
    clients = clients.filter(client => !accountsToDelete.includes(client.account));
    const encodedData = encodeToBase64(JSON.stringify(clients));
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
        const mfaSecret = extractMfaSecret(code.data); // QR 데이터에서 비밀키 추출
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
  // QR 데이터는 보통 otpauth://totp/... 형식
  const match = qrData.match(/secret=([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}