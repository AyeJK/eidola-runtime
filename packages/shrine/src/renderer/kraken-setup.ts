/** NZXT CAM Web Integration URL for Kraken LCD. */
export function krakenCamIntegrationUrl(origin: string = window.location.origin): string {
  return `${origin}/shrine/?kraken=1`;
}

function copyText(value: string): void {
  void navigator.clipboard?.writeText(value);
}

export function renderKrakenCamUrl(container: HTMLElement): void {
  const url = krakenCamIntegrationUrl();

  container.innerHTML = `
    <div class="kraken-setup-block">
      <p class="type-overline kraken-setup-label">Kraken LCD</p>
      <label class="kraken-setup-field">
        <span class="sr-only">Web Integration URL</span>
        <div class="kraken-setup-row">
          <input type="text" class="input-divine" readonly value="${url}" aria-label="NZXT CAM Web Integration URL" />
          <button type="button" class="btn-divine btn-nav !normal-case" data-copy="cam">Copy</button>
        </div>
      </label>
    </div>
  `;

  container.querySelector<HTMLButtonElement>('[data-copy="cam"]')?.addEventListener('click', () => {
    copyText(url);
  });
}
