console.log('background.js 실행 시작');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'login') {
    const { name, account, username, password, mfaSecret } = message.data;
    console.log('로그인 요청 수신:', message.data);
    console.log(name, account, username, password, mfaSecret);

    const loginUrl = `https://${account}.signin.aws.amazon.com/console`;
    chrome.tabs.create({ url: loginUrl }, (tab) => {
      chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);

          const otplib = require('otplib'); // otplib은 여기서만 사용
          const mfaCode = otplib.authenticator.generate(mfaSecret); // 전달된 otplib 사용

          setTimeout(() => {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: autoLogin,
              args: [username, password, mfaCode] // otplib 객체 전달
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