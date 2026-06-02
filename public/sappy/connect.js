/* sappy connect bridge — routes styled buttons to the real Dynamic widget */
(function () {
  function dynamicButton() {
    return document.querySelector("#dynamic-widget")?.shadowRoot?.querySelector("button, [role='button']")
      || document.querySelector("#sappy-dynamic-widget .dynamic-shadow-dom")?.shadowRoot?.querySelector("button, [role='button']")
      || document.querySelector("#sappy-dynamic-widget button, #sappy-dynamic-widget [role='button'], #dynamic-widget button, #dynamic-widget [role='button']");
  }

  function openDynamic(event) {
    if (event) event.preventDefault();
    if (typeof window.sappyOpenDynamic === "function" && window.sappyOpenDynamic !== openDynamic) {
      window.sappyOpenDynamic();
      return true;
    }
    const button = dynamicButton();
    if (button) {
      button.click();
      return true;
    }
    window.__sappyPendingDynamicWallet = true;
    window.dispatchEvent(new CustomEvent("sappy-dynamic-wallet-request"));
    return false;
  }

  window.sappyConnectNow = openDynamic;
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-connect]")) return;
    if (openDynamic(event)) event.stopImmediatePropagation();
  }, true);
})();
