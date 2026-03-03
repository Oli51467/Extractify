<template>
  <span class="brand-logo" role="img" aria-label="DocPix Studio">
    <svg
      class="brand-mark"
      viewBox="0 0 56 56"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="docpix-bg" x1="8" y1="6" x2="48" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#6B7CFF" />
          <stop offset="0.56" stop-color="#3F79F3" />
          <stop offset="1" stop-color="#21C3FF" />
        </linearGradient>
        <linearGradient id="docpix-fold" x1="31" y1="13" x2="41" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#EAF3FF" />
          <stop offset="1" stop-color="#BFD3FF" />
        </linearGradient>
        <linearGradient id="docpix-pix" x1="33" y1="27" x2="44" y2="39" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#8FE0FF" />
          <stop offset="1" stop-color="#C286FF" />
        </linearGradient>
      </defs>

      <rect x="3.5" y="3.5" width="49" height="49" rx="14" fill="url(#docpix-bg)" />
      <rect x="3.5" y="3.5" width="49" height="49" rx="14" fill="none" stroke="rgba(255,255,255,0.16)" />

      <path
        d="M16 13h17.8a5.2 5.2 0 0 1 5.2 5.2V39a5.2 5.2 0 0 1-5.2 5.2H16A5.2 5.2 0 0 1 10.8 39V18.2A5.2 5.2 0 0 1 16 13Z"
        fill="rgba(255,255,255,0.94)"
      />
      <path d="M33 13h5.1a5 5 0 0 1 5 5v5.1H33Z" fill="url(#docpix-fold)" />
      <path d="M18 23h12M18 27.8h12M18 32.6h8.2" stroke="#ADC3EE" stroke-width="2.1" stroke-linecap="round" />

      <rect x="32.6" y="29.5" width="4.7" height="4.7" rx="1.4" fill="url(#docpix-pix)" />
      <rect x="38.6" y="29.5" width="4.7" height="4.7" rx="1.4" fill="url(#docpix-pix)" opacity="0.86" />
      <rect x="35.6" y="35.5" width="4.7" height="4.7" rx="1.4" fill="url(#docpix-pix)" opacity="0.92" />
    </svg>

    <span class="brand-wordmark">
      <span class="brand-main">DocPix</span>
      <span class="brand-sub">Studio</span>
    </span>
  </span>
</template>

<style scoped lang="scss">
.brand-logo {
  align-items: center;
  display: inline-flex;
  gap: 0.68rem;
  line-height: 1;
  user-select: none;
}

.brand-mark {
  filter: drop-shadow(0 10px 18px rgba(63, 121, 243, 0.36));
  height: 40px;
  transition: transform 0.22s ease, filter 0.22s ease;
  width: 40px;
}

.brand-wordmark {
  align-items: baseline;
  display: inline-flex;
  gap: 0.34rem;
}

.brand-main,
.brand-sub {
  display: inline-block;
  font-size: 1.22rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  margin: 0;
}

.brand-main {
  background: linear-gradient(120deg, #1c2f55 0%, #3a6fd8 42%, #21a8e8 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.brand-sub {
  color: #3f79f3;
  font-weight: 700;
}

.brand-logo:hover .brand-mark {
  filter: drop-shadow(0 14px 22px rgba(63, 121, 243, 0.42));
  transform: translateY(-1px);
}

@media (max-width: 768px) {
  .brand-mark {
    height: 34px;
    width: 34px;
  }

  .brand-main,
  .brand-sub {
    font-size: 1.08rem;
  }
}
</style>
