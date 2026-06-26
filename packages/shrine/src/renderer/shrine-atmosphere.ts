const PARTICLE_COUNT = 36;

export function mountShrineAtmosphere(root: HTMLElement = document.body): void {
  if (root.querySelector('.shrine-atmosphere')) {
    return;
  }

  const atmosphere = document.createElement('div');
  atmosphere.className = 'shrine-atmosphere';
  atmosphere.setAttribute('aria-hidden', 'true');
  atmosphere.innerHTML = `
    <div class="god-rays"></div>
    <div class="particle-field"></div>
    <div class="landing-vignette"></div>
    <div class="noise-overlay"></div>
  `;

  const field = atmosphere.querySelector('.particle-field');
  if (field) {
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const particle = document.createElement('span');
      particle.className = 'particle';
      const left = (index * 17 + 11) % 100;
      const delay = (index * 0.37) % 8;
      const duration = 12 + (index % 7);
      const size = index % 3 === 0 ? 3 : 2;
      particle.style.left = `${left}%`;
      particle.style.animationDelay = `${delay}s`;
      particle.style.animationDuration = `${duration}s`;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      field.appendChild(particle);
    }
  }

  root.prepend(atmosphere);
}
