// Original characters for the 3ayni presentations, drawn as SVG.
//   Salma   - the night nurse who guides the audience
//   Am Hédi - a 64-year-old stroke patient, awake but unable to speak or move
// Every colour is a CSS custom property, so a deck can restyle the same
// drawing (warm illustration, or a cyan hologram) without new artwork.

window.Characters = (function () {
  const c = (name, fallback) => `var(--${name}, ${fallback})`;

  // Shared palette (overridable per deck)
  const SKIN = c('salma-skin', '#c98d63');
  const SKIN_SHADE = c('salma-skin-shade', '#b07650');
  const SCRUBS = c('scrubs', '#2f9e95');
  const SCRUBS_DARK = c('scrubs-dark', '#25807a');
  const CAP = c('cap', '#3fb5aa');
  const INK = c('ink', '#2a1c14');
  const LIP = c('lip', '#a24b46');
  const BLUSH = c('blush', '#e08a7a');
  const WHITE = c('white', '#f3f7f8');
  const STEEL = c('steel', '#c9d3dc');
  const LINE = c('line', 'none');
  const LW = c('line-width', '0');

  /** Head and shoulders of Salma, facing the viewer. viewBox 0 0 400 480. */
  function salmaBust({ id = 'salma', mood = 'smile' } = {}) {
    const mouth =
      mood === 'talk'
        ? `<path class="mouth" d="M182 272 Q200 296 218 272 Q200 282 182 272 Z" fill="${LIP}" stroke="${LINE}" stroke-width="${LW}"/>`
        : `<path class="mouth" d="M180 274 Q200 292 220 274" fill="none" stroke="${LIP}" stroke-width="5" stroke-linecap="round"/>`;
    return `
<svg class="character salma" id="${id}" viewBox="0 0 400 480" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Salma, the night nurse">
  <g class="body">
    <path d="M24 480 C34 404 86 364 150 354 L250 354 C314 364 366 404 376 480 Z" fill="${SCRUBS}" stroke="${LINE}" stroke-width="${LW}"/>
    <path d="M150 354 C120 362 98 376 84 392 L110 480 L60 480 C66 420 96 378 150 354 Z" fill="${SCRUBS_DARK}" opacity=".55"/>
    <path d="M163 354 L200 408 L237 354 Z" fill="${WHITE}" stroke="${LINE}" stroke-width="${LW}"/>
    <path d="M150 354 L200 420 L250 354" fill="none" stroke="${SCRUBS_DARK}" stroke-width="6" stroke-linejoin="round"/>
  </g>
  <path class="neck" d="M174 296 L226 296 L229 356 Q200 374 171 356 Z" fill="${SKIN_SHADE}" stroke="${LINE}" stroke-width="${LW}"/>
  <g class="head">
    <ellipse cx="122" cy="228" rx="13" ry="20" fill="${SKIN_SHADE}" stroke="${LINE}" stroke-width="${LW}"/>
    <ellipse cx="278" cy="228" rx="13" ry="20" fill="${SKIN_SHADE}" stroke="${LINE}" stroke-width="${LW}"/>
    <ellipse cx="200" cy="216" rx="78" ry="92" fill="${SKIN}" stroke="${LINE}" stroke-width="${LW}"/>
    <path d="M126 196 C126 226 132 244 140 254 L142 196 Z" fill="${INK}" opacity=".85"/>
    <path d="M274 196 C274 226 268 244 260 254 L258 196 Z" fill="${INK}" opacity=".85"/>
    <path class="cap" d="M118 204 C114 128 160 104 200 104 C240 104 286 128 282 204 C264 176 232 166 200 166 C168 166 136 176 118 204 Z" fill="${CAP}" stroke="${LINE}" stroke-width="${LW}"/>
    <path d="M136 150 C160 132 240 132 264 150" fill="none" stroke="${SCRUBS_DARK}" stroke-width="3" opacity=".5"/>
    <path d="M150 196 Q168 186 186 194" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <path d="M214 194 Q232 186 250 196" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <g class="eyes">
      <ellipse class="eye" cx="168" cy="222" rx="9.5" ry="11" fill="${INK}"/>
      <ellipse class="eye" cx="232" cy="222" rx="9.5" ry="11" fill="${INK}"/>
      <circle cx="171" cy="218" r="3" fill="${WHITE}"/>
      <circle cx="235" cy="218" r="3" fill="${WHITE}"/>
    </g>
    <path d="M200 232 Q193 252 203 258" fill="none" stroke="${SKIN_SHADE}" stroke-width="4" stroke-linecap="round"/>
    <circle cx="150" cy="252" r="15" fill="${BLUSH}" opacity=".28"/>
    <circle cx="250" cy="252" r="15" fill="${BLUSH}" opacity=".28"/>
    ${mouth}
  </g>
  <g class="stethoscope">
    <path d="M146 356 C142 408 168 438 200 440 C232 438 258 408 254 356" fill="none" stroke="${STEEL}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="200" cy="448" r="14" fill="${STEEL}" stroke="${LINE}" stroke-width="${LW}"/>
    <circle cx="200" cy="448" r="7" fill="${SCRUBS_DARK}"/>
  </g>
  <g class="badge">
    <rect x="262" y="398" width="44" height="54" rx="6" fill="${WHITE}" stroke="${LINE}" stroke-width="${LW}"/>
    <rect x="262" y="398" width="44" height="12" rx="4" fill="${SCRUBS_DARK}"/>
    <rect x="272" y="420" width="24" height="4" rx="2" fill="${STEEL}"/>
    <rect x="272" y="430" width="16" height="4" rx="2" fill="${STEEL}"/>
  </g>
</svg>`;
  }

  /** Salma standing, holding her phone. viewBox 0 0 300 700. */
  function salmaStanding({ id = 'salma-standing', phoneGlow = false } = {}) {
    return `
<svg class="character salma-standing" id="${id}" viewBox="0 0 300 700" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Salma holding her phone">
  <ellipse cx="150" cy="690" rx="96" ry="10" fill="#000" opacity=".25"/>
  <path d="M104 470 L96 676 L140 676 L150 520 L160 676 L204 676 L196 470 Z" fill="${SCRUBS_DARK}" stroke="${LINE}" stroke-width="${LW}"/>
  <rect x="92" y="668" width="50" height="16" rx="8" fill="${WHITE}"/>
  <rect x="158" y="668" width="50" height="16" rx="8" fill="${WHITE}"/>
  <path d="M86 232 C80 300 86 400 98 480 L202 480 C214 400 220 300 214 232 C196 216 176 210 150 210 C124 210 104 216 86 232 Z" fill="${SCRUBS}" stroke="${LINE}" stroke-width="${LW}"/>
  <path d="M128 214 L150 252 L172 214 Z" fill="${WHITE}"/>
  <path d="M86 236 C64 290 62 352 78 404 L102 398 C94 352 96 300 108 262 Z" fill="${SCRUBS}" stroke="${LINE}" stroke-width="${LW}"/>
  <path d="M214 236 C238 270 242 320 224 352 L196 362 L190 340 L210 330 C216 306 210 280 196 262 Z" fill="${SCRUBS}" stroke="${LINE}" stroke-width="${LW}"/>
  <circle cx="84" cy="412" r="14" fill="${SKIN}"/>
  <g class="phone">
    <rect x="150" y="318" width="44" height="76" rx="8" fill="#141a22" stroke="${STEEL}" stroke-width="3"/>
    <rect class="phone-screen" x="155" y="326" width="34" height="60" rx="4" fill="${phoneGlow ? '#e5534b' : '#2b3644'}"/>
  </g>
  <circle cx="188" cy="360" r="13" fill="${SKIN}"/>
  <path d="M118 222 C116 266 136 288 150 288 C164 288 184 266 182 222" fill="none" stroke="${STEEL}" stroke-width="5"/>
  <circle cx="150" cy="292" r="8" fill="${STEEL}"/>
  <rect x="136" y="188" width="28" height="30" fill="${SKIN_SHADE}"/>
  <ellipse cx="150" cy="128" rx="48" ry="58" fill="${SKIN}" stroke="${LINE}" stroke-width="${LW}"/>
  <path d="M100 122 C96 70 126 54 150 54 C174 54 204 70 200 122 C188 104 170 98 150 98 C130 98 112 104 100 122 Z" fill="${CAP}" stroke="${LINE}" stroke-width="${LW}"/>
  <path d="M104 118 C104 136 108 148 112 154 L114 118 Z" fill="${INK}" opacity=".85"/>
  <path d="M196 118 C196 136 192 148 188 154 L186 118 Z" fill="${INK}" opacity=".85"/>
  <path d="M128 116 Q138 110 146 114" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
  <path d="M154 114 Q162 110 172 116" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
  <ellipse cx="137" cy="132" rx="5.5" ry="6.5" fill="${INK}"/>
  <ellipse cx="163" cy="132" rx="5.5" ry="6.5" fill="${INK}"/>
  <path d="M138 158 Q150 168 162 158" fill="none" stroke="${LIP}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="124" cy="148" r="9" fill="${BLUSH}" opacity=".28"/>
  <circle cx="176" cy="148" r="9" fill="${BLUSH}" opacity=".28"/>
</svg>`;
  }

  /** Am Hédi in his hospital bed, with the 3ayni laptop on its arm. viewBox 0 0 900 520. */
  function patientInBed({ id = 'patient' } = {}) {
    const PSKIN = c('hedi-skin', '#b9805a');
    const PSHADE = c('hedi-skin-shade', '#9c6a48');
    const HAIR = c('hedi-hair', '#d9dde2');
    const GOWN = c('gown', '#8fb7d6');
    const BLANKET = c('blanket', '#e8eef4');
    const BLANKET_SHADE = c('blanket-shade', '#c9d6e2');
    const FRAME = c('bed-frame', '#5f6f82');
    const SCREEN = c('laptop-screen', '#0e1116');
    const TILE = c('tile', '#4fb3a9');
    return `
<svg class="character patient" id="${id}" viewBox="0 0 900 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Am Hédi lying in bed, looking at the 3ayni laptop">
  <ellipse cx="450" cy="506" rx="400" ry="12" fill="#000" opacity=".25"/>
  <rect x="60" y="150" width="26" height="340" rx="10" fill="${FRAME}"/>
  <rect x="814" y="250" width="22" height="240" rx="10" fill="${FRAME}"/>
  <rect x="86" y="330" width="740" height="46" rx="14" fill="${FRAME}" stroke="${LINE}" stroke-width="${LW}"/>
  <rect x="120" y="376" width="16" height="104" fill="${FRAME}"/>
  <rect x="770" y="376" width="16" height="104" fill="${FRAME}"/>
  <circle cx="128" cy="486" r="12" fill="#2f3a46"/>
  <circle cx="778" cy="486" r="12" fill="#2f3a46"/>
  <rect x="86" y="300" width="740" height="40" rx="16" fill="${WHITE}" stroke="${LINE}" stroke-width="${LW}"/>
  <path d="M96 250 C96 214 128 204 170 206 L292 214 C320 216 330 240 326 262 C322 290 300 300 270 300 L130 300 C108 300 96 284 96 250 Z" fill="${WHITE}" stroke="${LINE}" stroke-width="${LW}"/>
  <path d="M250 270 C300 246 360 240 420 248 L420 306 L250 306 Z" fill="${GOWN}" stroke="${LINE}" stroke-width="${LW}"/>
  <g class="patient-head">
    <ellipse cx="210" cy="238" rx="56" ry="50" fill="${PSKIN}" stroke="${LINE}" stroke-width="${LW}"/>
    <path d="M160 214 C166 184 196 172 226 178 C250 182 266 198 266 220 C250 204 228 200 208 202 C188 204 172 210 160 214 Z" fill="${HAIR}" stroke="${LINE}" stroke-width="${LW}"/>
    <path d="M182 226 Q194 218 206 224" fill="none" stroke="${HAIR}" stroke-width="7" stroke-linecap="round"/>
    <path d="M222 224 Q234 218 246 224" fill="none" stroke="${HAIR}" stroke-width="7" stroke-linecap="round"/>
    <g class="patient-eyes">
      <ellipse class="eye" cx="196" cy="238" rx="6.5" ry="7.5" fill="${INK}"/>
      <ellipse class="eye" cx="234" cy="238" rx="6.5" ry="7.5" fill="${INK}"/>
      <circle cx="199" cy="235" r="2.2" fill="${WHITE}"/>
      <circle cx="237" cy="235" r="2.2" fill="${WHITE}"/>
    </g>
    <path d="M215 244 Q211 258 218 262" fill="none" stroke="${PSHADE}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M192 270 C202 262 228 262 238 270 C228 278 202 278 192 270 Z" fill="${HAIR}"/>
  </g>
  <path d="M330 268 C420 250 560 252 700 262 C760 266 812 276 822 300 L822 340 L300 340 C300 300 308 274 330 268 Z" fill="${BLANKET}" stroke="${LINE}" stroke-width="${LW}"/>
  <path d="M380 276 C460 292 560 296 680 286" fill="none" stroke="${BLANKET_SHADE}" stroke-width="6" stroke-linecap="round"/>
  <path d="M430 300 C520 318 620 320 760 306" fill="none" stroke="${BLANKET_SHADE}" stroke-width="6" stroke-linecap="round"/>
  <path d="M300 268 L330 268 L330 340 L300 340 Z" fill="${BLANKET_SHADE}"/>
  <rect x="300" y="262" width="530" height="12" rx="6" fill="${BLANKET_SHADE}" opacity=".7"/>
  <g class="laptop">
    <rect x="452" y="96" width="10" height="210" fill="${FRAME}"/>
    <path d="M400 96 L520 96" stroke="${FRAME}" stroke-width="10" stroke-linecap="round"/>
    <g transform="rotate(-8 400 70)">
      <rect x="318" y="0" width="190" height="122" rx="10" fill="#1b2029" stroke="${STEEL}" stroke-width="3"/>
      <rect class="laptop-screen" x="328" y="10" width="170" height="102" rx="4" fill="${SCREEN}"/>
      <g class="laptop-tiles">
        <rect x="336" y="18" width="48" height="40" rx="5" fill="${TILE}" opacity=".9"/>
        <rect x="389" y="18" width="48" height="40" rx="5" fill="${TILE}" opacity=".35"/>
        <rect x="442" y="18" width="48" height="40" rx="5" fill="${TILE}" opacity=".35"/>
        <rect x="336" y="64" width="48" height="40" rx="5" fill="${TILE}" opacity=".35"/>
        <rect x="389" y="64" width="48" height="40" rx="5" fill="${TILE}" opacity=".35"/>
        <rect x="442" y="64" width="48" height="40" rx="5" fill="${TILE}" opacity=".35"/>
      </g>
      <circle cx="413" cy="5" r="2.5" fill="${TILE}"/>
    </g>
  </g>
</svg>`;
  }

  return { salmaBust, salmaStanding, patientInBed };
})();
