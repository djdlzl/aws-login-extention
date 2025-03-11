const DEBUG = true;
function log(...args) {
  if (DEBUG) console.log(...args);
}

log('background.js 실행 시작');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'login') {
    const { name, account, username, password, mfaSecret } = message.data;
    log('로그인 요청 수신:', message.data);

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
            if (chrome.runtime.lastError) log('스크립트 삽입 오류:', chrome.runtime.lastError);
            else log('스크립트 삽입 성공');
          });
        },500);
        }
      });
    });
  }
});

function autoLogin(username, password, mfaCode) {
  const observer = new MutationObserver((mutations, obs) => {
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
      const mfaObserver = new MutationObserver(() => {
        const mfaField = document.querySelector('#mfaCode');
        const submitButton = document.querySelector('button[type="submit"]') || document.querySelector('#signin_button');
        if (mfaField && submitButton) {
          mfaField.value = mfaCode;
          mfaField.dispatchEvent(new Event('input', { bubbles: true }));
          submitButton.click();
          mfaObserver.disconnect();
        }
      });
      mfaObserver.observe(document.body, { childList: true, subtree: true });
      obs.disconnect();
    },500);
  }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}