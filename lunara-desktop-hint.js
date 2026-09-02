/* ═══════════════════════════════════════════════════════════════════
   THE DESKTOP HINT
   ═══════════════════════════════════════════════════════════════════

   A small, once-only note for people arriving on a narrow screen,
   telling them the site has a wider layout and how to reach it.

   Three things this deliberately does not do.

   It does not quote the menu item by name. Android Chrome in Swedish
   says "Datorversion", in German "Desktopwebsite", in Japanese "PC版
   サイト" — a translated sentence quoting the English label would be
   wrong everywhere except English. The ⋮ glyph is the same in every
   language, so the instruction points at the icon and describes the
   option rather than naming it.

   It does not tell iPhone users to press three dots. Safari on iOS
   has no such control; it has aA in the address bar. Sending someone
   hunting for a button that is not there is worse than saying nothing,
   so the wording follows the browser.

   It does not nag. Once dismissed — by the close button, or by the
   twelve seconds running out — it is not shown again on this device.
   A visitor who has read it and decided against desktop mode has
   answered the question.

   Anyone already in desktop mode reports a viewport far wider than
   the threshold, so they are excluded without needing to be detected.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var KEY     = 'lx-desktop-hint';
  var MAX_W   = 820;    /* narrower than this and the wide layout is lost */
  var DELAY   = 1400;   /* let the page paint before interrupting it */
  var LIFE    = 12000;  /* then it leaves on its own */

  /* t: heading.  a: browsers with an overflow menu.  b: Safari on iOS.
     x: the close control's accessible name. */
  var T = {
    en: { t:'Better on a wide screen',
          a:'Lunara is built for desktop. For the full layout, open your browser menu (⋮, top right) and switch on the desktop site option.',
          b:'Lunara is built for desktop. For the full layout, tap aA in the address bar and choose the desktop website option.',
          x:'Dismiss' },
    sv: { t:'Bäst på stor skärm',
          a:'Lunara är gjord för dator. För hela vyn, öppna webbläsarens meny (⋮ uppe till höger) och slå på alternativet för datorversion.',
          b:'Lunara är gjord för dator. För hela vyn, tryck på aA i adressfältet och välj alternativet för datorversion.',
          x:'Stäng' },
    da: { t:'Bedst på en stor skærm',
          a:'Lunara er lavet til computer. For det fulde layout skal du åbne browserens menu (⋮ øverst til højre) og slå indstillingen for computerversion til.',
          b:'Lunara er lavet til computer. For det fulde layout skal du trykke på aA i adresselinjen og vælge computerversion.',
          x:'Luk' },
    nb: { t:'Best på stor skjerm',
          a:'Lunara er laget for datamaskin. For full visning, åpne nettlesermenyen (⋮ øverst til høyre) og slå på alternativet for datamaskinversjon.',
          b:'Lunara er laget for datamaskin. For full visning, trykk på aA i adressefeltet og velg datamaskinversjon.',
          x:'Lukk' },
    fi: { t:'Toimii parhaiten isolla näytöllä',
          a:'Lunara on suunniteltu tietokoneelle. Saat koko näkymän avaamalla selaimen valikon (⋮ oikeassa yläkulmassa) ja ottamalla työpöytäversion käyttöön.',
          b:'Lunara on suunniteltu tietokoneelle. Saat koko näkymän napauttamalla aA-kuvaketta osoiterivillä ja valitsemalla työpöytäversion.',
          x:'Sulje' },
    de: { t:'Besser auf großem Bildschirm',
          a:'Lunara ist für den Desktop gestaltet. Für die vollständige Ansicht öffnen Sie das Browsermenü (⋮ oben rechts) und aktivieren Sie die Desktop-Website.',
          b:'Lunara ist für den Desktop gestaltet. Für die vollständige Ansicht tippen Sie auf aA in der Adressleiste und wählen Sie die Desktop-Website.',
          x:'Schließen' },
    nl: { t:'Beter op een groot scherm',
          a:'Lunara is gemaakt voor desktop. Open voor de volledige weergave het browsermenu (⋮ rechtsboven) en zet de desktopsite aan.',
          b:'Lunara is gemaakt voor desktop. Tik voor de volledige weergave op aA in de adresbalk en kies de desktopwebsite.',
          x:'Sluiten' },
    fr: { t:'Mieux sur grand écran',
          a:'Lunara est conçu pour le bureau. Pour la mise en page complète, ouvrez le menu du navigateur (⋮ en haut à droite) et activez l’option site pour ordinateur.',
          b:'Lunara est conçu pour le bureau. Pour la mise en page complète, touchez aA dans la barre d’adresse et choisissez la version pour ordinateur.',
          x:'Fermer' },
    es: { t:'Mejor en pantalla grande',
          a:'Lunara está diseñado para escritorio. Para ver el diseño completo, abre el menú del navegador (⋮ arriba a la derecha) y activa la opción de sitio para ordenador.',
          b:'Lunara está diseñado para escritorio. Para ver el diseño completo, toca aA en la barra de direcciones y elige la versión para ordenador.',
          x:'Cerrar' },
    pt: { t:'Melhor num ecrã grande',
          a:'O Lunara foi concebido para computador. Para o esquema completo, abra o menu do navegador (⋮ canto superior direito) e ative a opção de site para computador.',
          b:'O Lunara foi concebido para computador. Para o esquema completo, toque em aA na barra de endereço e escolha a versão para computador.',
          x:'Fechar' },
    it: { t:'Meglio su schermo grande',
          a:'Lunara è progettato per il desktop. Per il layout completo, apri il menu del browser (⋮ in alto a destra) e attiva l’opzione sito desktop.',
          b:'Lunara è progettato per il desktop. Per il layout completo, tocca aA nella barra degli indirizzi e scegli la versione desktop.',
          x:'Chiudi' },
    pl: { t:'Lepiej na dużym ekranie',
          a:'Lunara jest zaprojektowana na komputer. Aby zobaczyć pełny układ, otwórz menu przeglądarki (⋮ w prawym górnym rogu) i włącz opcję wersji na komputer.',
          b:'Lunara jest zaprojektowana na komputer. Aby zobaczyć pełny układ, dotknij aA na pasku adresu i wybierz wersję na komputer.',
          x:'Zamknij' },
    cs: { t:'Lépe na velké obrazovce',
          a:'Lunara je navržena pro počítač. Pro plné zobrazení otevřete nabídku prohlížeče (⋮ vpravo nahoře) a zapněte možnost verze pro počítač.',
          b:'Lunara je navržena pro počítač. Pro plné zobrazení klepněte na aA v adresním řádku a zvolte verzi pro počítač.',
          x:'Zavřít' },
    el: { t:'Καλύτερα σε μεγάλη οθόνη',
          a:'Το Lunara είναι σχεδιασμένο για υπολογιστή. Για πλήρη προβολή, ανοίξτε το μενού του προγράμματος περιήγησης (⋮ επάνω δεξιά) και ενεργοποιήστε την επιλογή ιστότοπου για υπολογιστή.',
          b:'Το Lunara είναι σχεδιασμένο για υπολογιστή. Για πλήρη προβολή, πατήστε aA στη γραμμή διευθύνσεων και επιλέξτε την έκδοση για υπολογιστή.',
          x:'Κλείσιμο' },
    ro: { t:'Mai bine pe ecran mare',
          a:'Lunara este creat pentru desktop. Pentru aspectul complet, deschide meniul browserului (⋮ dreapta sus) și activează opțiunea site pentru desktop.',
          b:'Lunara este creat pentru desktop. Pentru aspectul complet, atinge aA în bara de adrese și alege versiunea pentru desktop.',
          x:'Închide' },
    hu: { t:'Nagy képernyőn jobb',
          a:'A Lunara asztali gépre készült. A teljes elrendezéshez nyisd meg a böngésző menüjét (⋮ jobbra fent), és kapcsold be az asztali webhely lehetőséget.',
          b:'A Lunara asztali gépre készült. A teljes elrendezéshez koppints az aA elemre a címsorban, és válaszd az asztali webhelyet.',
          x:'Bezárás' },
    tr: { t:'Büyük ekranda daha iyi',
          a:'Lunara masaüstü için tasarlandı. Tam görünüm için tarayıcı menüsünü açın (⋮ sağ üstte) ve masaüstü site seçeneğini açın.',
          b:'Lunara masaüstü için tasarlandı. Tam görünüm için adres çubuğundaki aA simgesine dokunun ve masaüstü site sürümünü seçin.',
          x:'Kapat' },
    uk: { t:'Краще на великому екрані',
          a:'Lunara створено для комп’ютера. Щоб побачити повний вигляд, відкрийте меню браузера (⋮ угорі праворуч) і увімкніть версію для комп’ютера.',
          b:'Lunara створено для комп’ютера. Щоб побачити повний вигляд, торкніться aA в адресному рядку й виберіть версію для комп’ютера.',
          x:'Закрити' },
    ru: { t:'Лучше на большом экране',
          a:'Lunara рассчитана на компьютер. Чтобы увидеть полную версию, откройте меню браузера (⋮ вверху справа) и включите версию для компьютера.',
          b:'Lunara рассчитана на компьютер. Чтобы увидеть полную версию, нажмите aA в адресной строке и выберите версию для компьютера.',
          x:'Закрыть' },
    ar: { t:'أفضل على شاشة كبيرة',
          a:'صُمم Lunara لأجهزة الكمبيوتر. لعرض التخطيط الكامل، افتح قائمة المتصفح (⋮) وفعّل خيار عرض موقع الكمبيوتر.',
          b:'صُمم Lunara لأجهزة الكمبيوتر. لعرض التخطيط الكامل، اضغط على aA في شريط العنوان واختر نسخة الكمبيوتر.',
          x:'إغلاق' },
    zh: { t:'建议使用电脑版浏览',
          a:'Lunara 为宽屏设计。如需完整版面，请打开浏览器菜单（右上角 ⋮）并开启电脑版网站选项。',
          b:'Lunara 为宽屏设计。如需完整版面，请点按地址栏中的 aA，然后选择电脑版网站。',
          x:'关闭' },
    ja: { t:'大きな画面での表示を推奨',
          a:'Lunara はデスクトップ向けに設計されています。全体のレイアウトを見るには、ブラウザのメニュー（右上の ⋮）を開き、PC版サイトをオンにしてください。',
          b:'Lunara はデスクトップ向けに設計されています。全体のレイアウトを見るには、アドレスバーの aA をタップし、デスクトップ用サイトを選択してください。',
          x:'閉じる' },
    /* Two regionals, because the generic tag is not merely accented but
       wrong: a Brazilian reads "ecrã" as Portugal's word for screen, and
       Taiwan does not read Simplified. Looked up before the base tag. */
    'pt-br': { t:'Melhor em tela grande',
          a:'O Lunara foi projetado para computador. Para ver o layout completo, abra o menu do navegador (⋮ canto superior direito) e ative a opção site para computador.',
          b:'O Lunara foi projetado para computador. Para ver o layout completo, toque em aA na barra de endereço e escolha a versão para computador.',
          x:'Fechar' },
    'zh-tw': { t:'建議使用電腦版瀏覽',
          a:'Lunara 為寬螢幕設計。如需完整版面，請開啟瀏覽器選單（右上角 ⋮）並開啟電腦版網站選項。',
          b:'Lunara 為寬螢幕設計。如需完整版面，請點按網址列中的 aA，然後選擇電腦版網站。',
          x:'關閉' },
    ko: { t:'큰 화면에서 더 좋습니다',
          a:'Lunara는 데스크톱에 맞게 설계되었습니다. 전체 레이아웃을 보려면 브라우저 메뉴(오른쪽 위 ⋮)를 열고 데스크톱 사이트 옵션을 켜세요.',
          b:'Lunara는 데스크톱에 맞게 설계되었습니다. 전체 레이아웃을 보려면 주소창의 aA를 누르고 데스크톱 사이트를 선택하세요.',
          x:'닫기' }
  };

  /* Norwegian arrives as nb, nn or no; Chinese and Portuguese arrive
     with a region attached. Match on the base tag, and walk the whole
     preference list rather than only the first — a reader whose phone
     is set to a language we do not carry may still prefer their second
     choice over English. */
  function strings() {
    var want = (navigator.languages && navigator.languages.length)
      ? navigator.languages : [navigator.language || 'en'];
    for (var i = 0; i < want.length; i++) {
      var tag  = String(want[i] || '').toLowerCase();
      var base = tag.split('-')[0];
      /* Hong Kong and Macau read Traditional, same as Taiwan. */
      if (base === 'zh' && /-(tw|hk|mo|hant)/.test(tag)) tag = 'zh-tw';
      if (base === 'pt' && /-br/.test(tag))              tag = 'pt-br';
      if (T[tag]) return { s: T[tag], lang: tag };
      if (base === 'no' || base === 'nn') base = 'nb';
      if (T[base]) return { s: T[base], lang: base };
    }
    return { s: T.en, lang: 'en' };
  }

  function seen() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function remember() {
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* private mode: shown once this load */ }
  }

  function show() {
    if (seen()) return;
    if (window.innerWidth > MAX_W) return;          /* desktop mode reports wide */
    if (document.getElementById('lx-dh')) return;

    var picked = strings();
    var s = picked.s;

    /* Safari on iOS is the only common browser with no overflow menu.
       Chrome, Firefox, Edge and Opera on iOS all keep their own. */
    var ua  = navigator.userAgent || '';
    var iOS = /iPad|iPhone|iPod/.test(ua) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var body = (iOS && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) ? s.b : s.a;

    var el = document.createElement('div');
    el.id = 'lx-dh';
    el.className = 'lx-dh';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('lang', picked.lang);
    if (picked.lang === 'ar') el.setAttribute('dir', 'rtl');

    var h = document.createElement('p');
    h.className = 'lx-dh-t';
    h.textContent = s.t;

    var p = document.createElement('p');
    p.className = 'lx-dh-b';
    p.textContent = body;

    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'lx-dh-x';
    x.setAttribute('aria-label', s.x);
    x.textContent = '×';

    el.appendChild(h);
    el.appendChild(p);
    el.appendChild(x);
    document.body.appendChild(el);

    /* Painted first, then made visible, so the transition has a frame
       to run from rather than snapping into place. */
    requestAnimationFrame(function () { el.classList.add('on'); });

    var timer = setTimeout(close, LIFE);
    function close() {
      clearTimeout(timer);
      remember();
      el.classList.remove('on');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }
    x.addEventListener('click', close);
  }

  function start() { setTimeout(show, DELAY); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
