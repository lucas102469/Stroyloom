(() => {
  const page = document.querySelector('#discover');
  const toolbar = page.querySelector('.discover-toolbar');
  const grid = page.querySelector('.discover-grid');
  let cards = [];
  const empty = grid.querySelector('.discover-no-matches');
  const sort = toolbar.querySelector('.discover-sort');
  const status = toolbar.querySelector('.discover-status');
  const [allGenres, ...genres] = toolbar.querySelectorAll('input[name="discover-genre"]');
  const catalog = page.querySelector('.discover-catalog');
  const likedWorksButton = document.querySelector('#likedWorksBtn');
  const discoverButton = document.querySelector('#discoverBtn');
  const genreFilters = toolbar.querySelector('.discover-genres');
  const likedCount = catalog.querySelector('.discover-liked-count');
  const likedSort = toolbar.querySelector('.discover-liked-sort');
  const genrePicker = toolbar.querySelector('.discover-genre-picker');
  const selectedGenreChips = toolbar.querySelector('.discover-selected-genres');
  const shelfHeading = toolbar.querySelector('.discover-shelf-heading');
  const catalogHeading = catalog.querySelector('.discover-catalog-heading');
  const catalogControls = toolbar.querySelector('.discover-controls');
  let collection = 'all';
  function placeCatalogTools() {
    const browsing = collection === 'all';
    page.dataset.collection = collection;
    catalogHeading.append(likedCount);
    catalogHeading.append(catalogControls);
    genrePicker.hidden = selectedGenreChips.hidden = !browsing;
    genrePicker.open = false;
  }
  function renderSelectedGenres() {
    selectedGenreChips.replaceChildren();
    for (const input of genres.filter(input => input.checked)) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'discover-genre-chip';
      chip.append(document.createTextNode(input.value));
      const close = document.createElement('span');
      close.textContent = '×';
      close.setAttribute('aria-hidden', 'true');
      chip.append(close);
      chip.setAttribute('aria-label', input.value + ' 장르 선택 해제');
      chip.onclick = () => {
        input.checked = false;
        updateCards();
      };
      selectedGenreChips.append(chip);
    }
  }
  let catalogRequest = 0;
  const detail = page.querySelector('.discover-detail');
  const reader = page.querySelector('.discover-reader');
  const publishPage = document.querySelector('.discover-publish');
  const episodeList = detail.querySelector('.discover-episode-list');
  const detailComments = detail.querySelector('.discover-comments');
  let activeCard;
  let published;
  let readerEpisode;
  let activeReading;
  let readingSaveTimer;
  let restoringReading = false;
  let readingRestoreId = 0;
  const readingCache = new Map();

  function readingKey(id) {
    return 'storyloom.public-reading.' + (account?.username || 'guest') + '.' + id;
  }

  function getReadingProgress(work) {
    let cached = readingCache.get(readingKey(work.id));
    if (!cached) {
      try { cached = JSON.parse(localStorage.getItem(readingKey(work.id))); } catch {}
    }
    const remote = work.readingProgress;
    const position = cached && (!remote || cached.updated >= remote.updated) ? cached : remote;
    return position && work.episodes.some(episode => episode.number === position.episode) ? position : null;
  }

  function updateReadingButton() {
    const button = detail.querySelector('.discover-work-actions > .primary');
    const position = published?.id ? getReadingProgress(published) : null;
    button.textContent = position ? '이어보기' : '첫 화 읽기';
    button.dataset.episode = position ? position.episode : published?.episodes[0]?.number || button.dataset.episode;
    button.dataset.resume = position ? 'true' : 'false';
    button.title = position ? position.episode + '화에서 읽던 위치로 이동' : '';
  }

  function saveReadingPosition() {
    clearTimeout(readingSaveTimer);
    if (!activeReading || restoringReading || page.hidden || reader.hidden) return;
    const text = reader.querySelector('.discover-reader-text');
    const top = text.getBoundingClientRect().top + window.scrollY;
    const height = Math.max(1, text.offsetHeight);
    const position = {
      episode: activeReading.episode, scroll: window.scrollY,
      ratio: Math.max(-10, Math.min(1, (window.scrollY - top) / height)),
      width: window.innerWidth, updated: Date.now() / 1000
    };
    readingCache.set(readingKey(activeReading.work.id), position);
    try { localStorage.setItem(readingKey(activeReading.work.id), JSON.stringify(position)); } catch {}
    activeReading.work.readingProgress = position;
    updateReadingButton();
    fetch('/api/discover/works/' + activeReading.work.id + '/progress', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(position), keepalive: true
    }).catch(() => {});
  }

  window.addEventListener('scroll', () => {
    if (!activeReading || restoringReading || page.hidden || reader.hidden) return;
    clearTimeout(readingSaveTimer);
    readingSaveTimer = setTimeout(saveReadingPosition, 600);
  }, {passive: true});
  window.addEventListener('pagehide', saveReadingPosition);
  document.addEventListener('click', event => {
    if (!page.contains(event.target)) saveReadingPosition();
  }, {capture: true});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveReadingPosition();
  });
  new MutationObserver(() => {
    if (page.hidden) {
      clearTimeout(readingSaveTimer);
      activeReading = null;
    }
  }).observe(page, {attributes: true, attributeFilter: ['hidden']});
  const likeButton = detail.querySelector('.discover-like-stat');
  const engagementError = detail.querySelector('.discover-engagement-error');

  function updateEngagement(work, result) {
    Object.assign(work, result);
    const card = cards.find(item => item.dataset.publicId === work.id);
    if (card) {
      Object.assign(card.dataset, {likes: result.likes, views: result.views, liked: String(result.liked)});
      updateCards();
    }
    if (published !== work) return;
    detail.querySelector('.discover-likes').textContent = result.likes;
    detail.querySelector('.discover-views').textContent = '조회 ' + result.views.toLocaleString('ko-KR');
    likeButton.setAttribute('aria-pressed', String(result.liked));
    likeButton.setAttribute('aria-label', result.liked ? '좋아요 취소' : '좋아요');
  }

  likeButton.onclick = async () => {
    const work = published;
    if (!work?.id || likeButton.disabled) return;
    engagementError.hidden = true;
    likeButton.disabled = true;
    try {
      updateEngagement(work, await discoverRequest('works/' + work.id + '/like', {liked: !work.liked}));
    } catch (error) {
      engagementError.textContent = error.message;
      engagementError.hidden = false;
    } finally {
      likeButton.disabled = !published?.id;
    }
  };

  async function discoverRequest(path, data) {
    const response = await fetch('/api/discover/' + path, data === undefined ? undefined : {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '요청을 처리하지 못했어요.');
    return result;
  }

  async function loadPublicCatalog() {
    const requestId = ++catalogRequest;
    const {works} = await discoverRequest(collection === 'liked' ? 'liked?sort=' + likedSort.value : 'works');
    if (requestId !== catalogRequest) return;
    for (const card of cards) card.remove();
    const template = page.querySelector('.discover-public-card');
    cards = works.map(work => {
      const card = template.content.firstElementChild.cloneNode(true);
      Object.assign(card.dataset, {
        publicId: work.id, genre: work.genres.join(','), status: work.status,
        views: work.views, likes: work.likes, liked: String(work.liked)
      });
      card.querySelector('.book-title').textContent = work.title;
      if (collection === 'liked') {
        const parts = work.title.match(/^(.+?)\s*([（(][^()（）]*[A-Za-z][^()（）]*[)）])$/u);
        if (parts) {
          const name = document.createElement('span');
          name.className = 'interest-cover-name';
          name.textContent = parts[1].trim();
          const subtitle = document.createElement('span');
          subtitle.className = 'interest-cover-subtitle';
          subtitle.textContent = parts[2];
          card.querySelector('.book-title').replaceChildren(name, subtitle);
        }
      }
      card.querySelector('.book-cover').style.setProperty('--cover', work.coverColor);
      card.querySelector('strong').textContent = work.title;
      card.querySelector('strong').title = work.title;
      const genreLabel = card.querySelector('.discover-card-meta span');
      genreLabel.textContent = work.genres.join(' · ');
      card.querySelector('.discover-card-summary').textContent =
        work.author + ' · ' + work.status + ' · ' + work.episodeCount + '화';
      if (work.origin) {
        const origin = document.createElement('span');
        origin.className = 'alternative-library-origin';
        origin.textContent = '다른 줄거리 · ' + work.origin.author + ' 원작 · ' + work.origin.episode + '화부터';
        card.querySelector('.discover-card-meta').append(origin);
      }
      return card;
    });
    updateCards();
  }

  function showView(view) {
    genrePicker.open = false;
    if (view === catalog) finishPublication();
    if (view !== reader) {
      saveReadingPosition();
      activeReading = null;
      readingRestoreId++;
      restoringReading = false;
    }
    page.classList.toggle('discover-work-view', view === detail || view === reader);
    for (const section of [catalog, detail, reader]) section.hidden = section !== view;
    view.querySelector('h1').focus({preventScroll: true});
    window.scrollTo(0, 0);
    window.storyloomNavigation?.record();
  }

  function episodeButton(number, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-button';
    button.dataset.episode = number;
    button.textContent = label;
    return button;
  }

  function detailEpisodeButton(number, title) {
    const button = episodeButton(number, '');
    const episodeNumber = document.createElement('span');
    episodeNumber.className = 'discover-episode-number';
    episodeNumber.textContent = number + '화';
    const episodeTitle = document.createElement('span');
    episodeTitle.className = 'discover-episode-title';
    episodeTitle.textContent = title && title !== number + '화' ? title : number + '화';
    const arrow = document.createElement('span');
    arrow.className = 'discover-episode-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    button.append(episodeNumber, episodeTitle, arrow);
    return button;
  }

  function renderComments(list, episode) {
    list.replaceChildren();
    const comments = published ? (published.comments || []).map(comment =>
      [comment.author, comment.text, comment.episode, comment.created]) : [];
    const count = comments.filter(comment => !episode || comment[2] === episode).length;
    if (list === detailComments) detail.querySelector('[data-discover-action="comments"]').textContent = '전체 댓글 ' + count;
    else reader.querySelector('h2').textContent = '댓글 ' + count;
    for (const [author, text, origin, created] of comments) {
      if (episode && episode !== origin) continue;
      const item = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = author;
      const avatar = document.createElement('span');
      avatar.className = 'discover-comment-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = Array.from(author)[0] || '작';
      const content = document.createElement('div');
      content.className = 'discover-comment-content';
      const header = document.createElement('div');
      header.className = 'discover-comment-meta';
      header.append(name);
      if (created) {
        const time = document.createElement('time');
        time.dateTime = new Date(created * 1000).toISOString();
        time.textContent = new Intl.DateTimeFormat('ko-KR', {
          month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
        }).format(new Date(created * 1000));
        header.append(time);
      }
      const body = document.createElement('p');
      body.textContent = text;
      if (!episode && origin) {
        const badge = episodeButton(origin, origin + '화');
        badge.disabled = Boolean(published && !published.episodes.some(ep => ep.number === origin));
        header.append(badge);
      }
      content.append(header, body);
      item.append(avatar, content);
      list.append(item);
    }
    if (!list.children.length) {
      const item = document.createElement('li');
      item.className = 'discover-comments-empty';
      item.textContent = '아직 댓글이 없어요.';
      list.append(item);
    }
  }

  function selectDetailTab(tab) {
    if (tab === 'alternatives' && !detail.querySelector('.alternative-list')) tab = 'episodes';
    episodeList.hidden = tab !== 'episodes';
    const selectionBar = detail.querySelector('.discover-publication-bar');
    if (selectionBar) selectionBar.hidden = tab !== 'episodes';
    detailComments.hidden = tab !== 'comments';
    const alternatives = detail.querySelector('.alternative-list');
    if (alternatives) alternatives.hidden = tab !== 'alternatives';
    detail.querySelector('.discover-comment-form').hidden = tab !== 'comments' || !published?.id;
    for (const button of detail.querySelectorAll('.discover-detail-tabs [data-discover-action]')) {
      button.setAttribute('aria-pressed', String(button.dataset.discoverAction === tab));
    }
    window.storyloomNavigation?.record();
  }

  async function openBranchWork(id) {
    const work = await discoverRequest('works/' + encodeURIComponent(id));
    openWork(cards.find(card => card.dataset.publicId === id) || null, work);
    window.scrollTo(0, 0);
  }

  function renderBranchControls(work) {
    detail.querySelectorAll('.alternative-controls,.alternative-list,.alternative-create').forEach(item => item.remove());
    const controls = document.createElement('div');
    controls.className = 'alternative-controls';
    if (work.origin) {
      const origin = document.createElement('button');
      origin.type = 'button';
      origin.className = 'text-button alternative-origin';
      origin.textContent = '원작 ' + work.origin.title + ' · ' + work.origin.author + ' · ' + work.origin.episode + '화부터 다른 줄거리';
      origin.onclick = () => openBranchWork(work.origin.id).catch(error => {
        engagementError.textContent = error.message;
        engagementError.hidden = false;
      });
      controls.append(origin);
    }
    if (controls.childNodes.length) detail.querySelector('.discover-work-title-row').after(controls);
    const alternativesTab = detail.querySelector('[data-discover-action="alternatives"]');
    alternativesTab.hidden = !work.id;
    alternativesTab.textContent = '다른 줄거리 ' + (work.branches?.length || 0);
    if (work.id) {
      const section = document.createElement('section');
      section.className = 'alternative-list';
      section.hidden = true;
      section.setAttribute('aria-label', '공개된 다른 줄거리');
      if (work.allowBranches) {
        const create = document.createElement('button');
        create.type = 'button';
        create.className = 'text-button alternative-create';
        create.textContent = '다른 줄거리 만들기';
        create.onclick = () => openBranchDialog(work);
        detail.querySelector('.discover-detail-actions').append(create);
      }
      if (!work.branches?.length) {
        const empty = document.createElement('p');
        empty.className = 'alternative-empty';
        empty.textContent = '아직 공개된 다른 줄거리가 없어요.';
        section.append(empty);
      }
      for (const branch of work.branches || []) {
        const row = document.createElement('article');
        row.className = 'alternative-row';
        const cover = document.createElement('span');
        cover.className = 'alternative-mini-cover';
        cover.style.setProperty('--cover', branch.coverColor || '#638076');
        cover.textContent = branch.title;
        cover.setAttribute('aria-hidden', 'true');
        const info = document.createElement('div');
        info.className = 'alternative-row-info';
        const heading = document.createElement('h3');
        heading.textContent = branch.author + '의 다른 줄거리';
        const meta = document.createElement('p');
        meta.textContent = branch.origin.episode + '화부터 · ' + branch.status + ' · ' + branch.episodeCount + '화';
        const stats = document.createElement('span');
        stats.className = 'alternative-row-stats';
        stats.append(likeButton.querySelector('svg').cloneNode(true), document.createTextNode(String(branch.likes)),
          detail.querySelector('.discover-view-stat svg').cloneNode(true), document.createTextNode('조회 ' + Number(branch.views).toLocaleString('ko-KR')));
        info.append(heading, meta, stats);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary alternative-read';
        button.textContent = '읽기 →';
        button.setAttribute('aria-label', branch.author + '의 다른 줄거리 읽기');
        button.onclick = () => openBranchWork(branch.id).catch(error => {
          engagementError.textContent = error.message;
          engagementError.hidden = false;
        });
        row.append(cover, info, button);
        section.append(row);
      }
      detail.append(section);
    }
  }

  function openBranchDialog(work) {
    if (!account?.logged_in) {
      engagementError.textContent = '로그인 후 다른 줄거리를 만들 수 있어요.';
      engagementError.hidden = false;
      return;
    }
    const available = work.episodes.filter(episode => (work.branchEpisodes || []).includes(episode.number));
    if (!available.length) {
      engagementError.textContent = '당시 확정 설정 기록이 있는 회차가 아직 없어요.';
      engagementError.hidden = false;
      return;
    }
    const dialog = document.createElement('dialog');
    dialog.className = 'length-dialog alternative-dialog';
    const form = document.createElement('form');
    const heading = document.createElement('h2');
    heading.textContent = '다른 줄거리 만들기';
    const label = document.createElement('label');
    label.textContent = '시작 회차';
    const select = document.createElement('select');
    for (const episode of available) {
      const option = document.createElement('option');
      option.value = episode.number;
      option.textContent = episode.number + '화 · ' + episode.title;
      select.append(option);
    }
    label.append(select);
    const error = document.createElement('p');
    error.setAttribute('role', 'status');
    const footer = document.createElement('footer');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';
    cancel.textContent = '취소';
    cancel.onclick = () => dialog.close();
    const submit = document.createElement('button');
    submit.className = 'primary';
    submit.textContent = '내 작품으로 가져오기';
    footer.append(cancel, submit);
    form.append(heading, label, error, footer);
    form.onsubmit = async event => {
      event.preventDefault();
      submit.disabled = cancel.disabled = select.disabled = true;
      submit.textContent = '가져오는 중…';
      dialog.oncancel = event => event.preventDefault();
      try {
        const result = await discoverRequest('works/' + work.id + '/branch', {episode: Number(select.value)});
        dialog.close();
        await window.openAlternativeProject(result.id);
      } catch (failure) { error.textContent = failure.message; }
      finally {
        submit.disabled = cancel.disabled = select.disabled = false;
        submit.textContent = '내 작품으로 가져오기';
        dialog.oncancel = null;
      }
    };
    dialog.append(form);
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
    select.focus();
  }


  function openWork(card, publicWork) {
    if (publicWork?.id) finishPublication();
    activeCard = card;
    published = publicWork;
    catalogBack.textContent =
      collection === 'liked' ? '← 관심 작품' : '← 작품 둘러보기';
    engagementError.hidden = true;
    likeButton.disabled = !publicWork?.id;
    likeButton.setAttribute('aria-pressed', String(Boolean(publicWork?.liked)));
    likeButton.setAttribute('aria-label', publicWork?.liked ? '좋아요 취소' : '좋아요');
    page.style.setProperty('--publication-cover', publicWork?.coverColor || '#506a59');
    const {author, status, views, likes} = publicWork;
    const title = publicWork.title;
    const cover = detail.querySelector('img');
    const textCover = detail.querySelector('.discover-text-cover');
    cover.hidden = Boolean(publicWork);
    textCover.hidden = !publicWork;
    if (publicWork) {
      textCover.querySelector('span').textContent = title;
      textCover.style.setProperty('--cover', publicWork.coverColor || 'var(--publication-cover,#506a59)');
    }
    detail.querySelector('h1').textContent = title;
    detail.querySelector('.discover-work-meta').textContent = '작가 ' + author + ' · ' + status;
    renderBranchControls(publicWork);
    const genreBox = detail.querySelector('.discover-work-genres');
    genreBox.replaceChildren(...publicWork.genres.map(genre => {
      const tag = document.createElement('span');
      tag.textContent = '#' + genre;
      return tag;
    }));
    detail.querySelector('.discover-synopsis').textContent = publicWork.synopsis;
    detail.querySelector('.discover-likes').textContent = likes;
    detail.querySelector('.discover-views').textContent = '조회 ' + views;
    episodeList.replaceChildren();
    const episodes = publicWork.episodes;
    const firstEpisode = detail.querySelector('.discover-work-actions button');
    firstEpisode.disabled = !episodes.length;
    firstEpisode.dataset.episode = episodes[0]?.number || '';
    updateReadingButton();
    for (const {number, title} of episodes) {
      const item = document.createElement('li');
      item.append(detailEpisodeButton(number, title));
      episodeList.append(item);
    }
    renderComments(detailComments);
    selectDetailTab('episodes');
    showView(detail);
  }

  function openEpisode(number, resume = false) {
    saveReadingPosition();
    const position = resume && published?.id ? getReadingProgress(published) : null;
    const episodes = published?.episodes || [];
    const index = episodes.findIndex(episode => episode.number === number);
    if (index === -1) return;
    const episode = episodes[index];
    activeReading = null;
    readerEpisode = number;
    reader.querySelector('.discover-comment-form').hidden = !published?.id;
    reader.querySelector('.discover-reader-work').textContent = detail.querySelector('h1').textContent;
    reader.querySelector('h1').textContent = number + '화' +
      (episode.title && episode.title !== number + '화' ? ' · ' + episode.title : '');
    reader.querySelector('.discover-reader-text').textContent = episode.text;
    reader.querySelector('h2').textContent = number + '화 댓글';
    for (const [selector, target] of [['.discover-previous', episodes[index - 1]], ['.discover-next', episodes[index + 1]]]) {
      const button = reader.querySelector(selector);
      button.dataset.episode = target?.number || '';
      button.disabled = !target;
    }
    renderComments(reader.querySelector('.discover-comments'), number);
    showView(reader);
    const restoreId = ++readingRestoreId;
    restoringReading = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (restoreId !== readingRestoreId || reader.hidden || page.hidden) return;
      let scroll = 0;
      if (position && position.episode === number) {
        const text = reader.querySelector('.discover-reader-text');
        scroll = position.width === window.innerWidth ? position.scroll :
          text.getBoundingClientRect().top + window.scrollY + position.ratio * text.offsetHeight;
      }
      window.scrollTo({top: Math.max(0, scroll), behavior: 'instant'});
      restoringReading = false;
      activeReading = published?.id ? {work: published, episode: number} : null;
      saveReadingPosition();
    }));
    if (published?.id) {
      const work = published;
      discoverRequest('works/' + work.id + '/episodes/' + number + '/view', {})
        .then(result => updateEngagement(work, {...result, likes: work.likes, liked: work.liked}))
        .catch(() => {});
    }
  }

  const catalogError = page.querySelector('.discover-catalog-error');
  function showCatalogError(error) {
    catalogError.textContent = error instanceof TypeError ? '화면을 불러오지 못했어요. 다시 시도해 주세요.' : error.message;
    catalogError.hidden = false;
  }

  async function handleDiscoverClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.matches('.discover-open')) {
      const card = button.closest('.discover-card');
      catalogError.hidden = true;
      button.disabled = true;
      try {
        const work = await discoverRequest('works/' + card.dataset.publicId);
        openWork(card, work);
      } catch (error) {
        showCatalogError(error);
      } finally {
        button.disabled = false;
      }
    }
    if (button.dataset.episode) openEpisode(Number(button.dataset.episode), button.dataset.resume === 'true');
    const action = button.dataset.discoverAction;
    if (action === 'catalog') {
      showView(catalog);
      activeCard?.querySelector('button')?.focus();
    }
    if (action === 'detail') showView(detail);
    if (action === 'episodes' || action === 'comments' || action === 'alternatives') {
      selectDetailTab(action);
      if (!reader.hidden) showView(detail);
    }
  }
  page.addEventListener('click', handleDiscoverClick);
  for (const form of page.querySelectorAll('.discover-comment-form')) {
    const input = form.querySelector('textarea');
    const expand = () => form.classList.add('expanded');
    input.addEventListener('focus', expand);
    input.addEventListener('input', expand);
    form.addEventListener('focusout', event => {
      if (!form.contains(event.relatedTarget) && !input.value.trim()) form.classList.remove('expanded');
    });
  }
  page.addEventListener('submit', async event => {
    const form = event.target.closest('.discover-comment-form');
    if (!form) return;
    event.preventDefault();
    const work = published;
    if (!work?.id) return;
    const input = form.querySelector('textarea');
    const errorMessage = form.querySelector('[role="alert"]');
    const button = form.querySelector('button');
    const text = input.value.trim();
    if (!text || button.disabled) return;
    button.disabled = input.disabled = true;
    errorMessage.hidden = true;
    try {
      const result = await discoverRequest('works/' + work.id + '/comments', {
        text, episode: reader.contains(form) ? readerEpisode : null
      });
      work.comments = result.comments;
      input.value = '';
      form.classList.remove('expanded');
      input.blur();
      if (published === work) {
        renderComments(detailComments);
        renderComments(reader.querySelector('.discover-comments'), readerEpisode);
      }
    } catch (error) {
      errorMessage.textContent = error.message;
      errorMessage.hidden = false;
    } finally {
      button.disabled = input.disabled = false;
    }
  });

  function updateCards(event) {
    if (event?.target === allGenres) {
      for (const genre of genres) genre.checked = false;
    }
    const selectedGenres = genres.filter(genre => genre.checked).map(genre => genre.value);
    allGenres.checked = selectedGenres.length === 0;
    renderSelectedGenres();
    const ordered = [...cards];
    if (sort.value !== 'recent') {
      ordered.sort((a, b) => Number(b.dataset[sort.value]) - Number(a.dataset[sort.value]));
    }
    let hasMatches = false;
    for (const card of ordered) {
      const cardGenres = card.dataset.genre.split(',');
      const matchesGenre = selectedGenres.every(genre => cardGenres.includes(genre));
      const matchesStatus = !status.value || card.dataset.status === status.value;
      card.hidden = !(matchesGenre && matchesStatus && (collection !== 'liked' || card.dataset.liked === 'true'));
      hasMatches ||= !card.hidden;
      grid.insertBefore(card, empty);
      card.querySelector('.discover-card-likes').textContent = Number(card.dataset.likes || 0).toLocaleString('ko-KR');
      card.querySelector('.discover-card-views').textContent = '조회 ' + Number(card.dataset.views || 0).toLocaleString('ko-KR');
    }
    empty.hidden = hasMatches;
    likedCount.textContent = collection === 'liked' ?
      cards.filter(card => card.dataset.liked === 'true').length : cards.length;
    empty.textContent = collection === 'liked' && !cards.some(card => card.dataset.liked === 'true') ?
      '아직 관심 작품이 없어요.' : !cards.length ? '아직 공개된 작품이 없어요.' : '선택한 조건에 맞는 작품이 없어요.';
  }

  function updateCollectionNavigation() {
    const active = document.body.dataset.page === 'discover';
    likedWorksButton.hidden = !account?.logged_in;
    likedWorksButton.removeAttribute('aria-current');
    if (active && collection === 'liked') {
      likedWorksButton.setAttribute('aria-current', 'page');
      discoverButton.removeAttribute('aria-current');
    }
  }

  function setCollection(value) {
    collection = value;
    catalogRequest++;
    page.dataset.collection = value;
    catalog.querySelector('h1').textContent = value === 'liked' ? '관심 작품' : '작품 둘러보기';
    toolbar.querySelector('.discover-shelf-heading strong').textContent =
      value === 'liked' ? '관심 작품' : '공개 작품';
    const isLiked = value === 'liked';
    likedSort.hidden = !isLiked;
    sort.hidden = status.hidden = isLiked;
    sort.value = 'recent';
    likedSort.value = 'liked';
    genreFilters.hidden = isLiked;
    for (const genre of genres) genre.checked = false;
    allGenres.checked = true;
    status.value = '';
    placeCatalogTools();
    renderSelectedGenres();
    catalogError.hidden = true;
    updateCollectionNavigation();
    window.storyloomNavigation?.record();
  }
  likedSort.onchange = () => loadPublicCatalog().catch(showCatalogError);

  likedWorksButton.onclick = async () => {
    try {
      safeMove();
      if (!account?.logged_in) return;
      show('discover');
      setCollection('liked');
      for (const card of cards) card.remove();
      cards = [];
      empty.hidden = true;
      showView(catalog);
      await loadPublicCatalog();
    } catch (error) {
      showCatalogError(error);
    }
  };
  discoverButton.addEventListener('click', () => {
    if (document.body.dataset.page !== 'discover') return;
    setCollection('all');
    showView(catalog);
    loadPublicCatalog().catch(showCatalogError);
  });
  new MutationObserver(updateCollectionNavigation).observe(document.body, {
    attributes: true, attributeFilter: ['data-page']
  });
  updateCollectionNavigation();
  placeCatalogTools();
  toolbar.querySelector('.discover-genre-reset').onclick = () => {
    for (const genre of genres) genre.checked = false;
    updateCards();
  };
  document.addEventListener('click', event => {
    if (genrePicker.open && !genrePicker.contains(event.target)) genrePicker.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && genrePicker.open) {
      event.preventDefault();
      genrePicker.open = false;
      genrePicker.querySelector('summary').focus();
    }
  });
  catalog.addEventListener('change', updateCards);
  updateCards();

  const errorMessage = publishPage.querySelector('[role="alert"]');
  const submit = publishPage.querySelector('.discover-publish-submit');
  const cancel = publishPage.querySelector('.discover-publish-cancel');
  const selectAll = publishPage.querySelector('.discover-publish-all');
  const publicationBar = publishPage.querySelector('.discover-publication-bar');
  const metadataChoice = publicationBar.querySelector('.discover-metadata-choice');
  const metadataInput = metadataChoice.querySelector('input');
  const branchInput = publishPage.querySelector('.discover-branch-allowed');
  const stopButton = publishPage.querySelector('.discover-publish-stop');
  const stopDialog = document.querySelector('.discover-stop-dialog');
  const catalogBack = detail.querySelector('[data-discover-action="catalog"]');
  const publishButton = document.querySelector('#projectHomePublishBtn');
  let source;
  let selectedProjectId;
  const publicationStates = new Map();

  async function refreshPublicationLabel() {
    if (document.body.dataset.page !== 'projectHome' || !project?.id) return;
    const id = project.id;
    publishButton.textContent = publicationStates.get(id) ? '공개 관리' : '공개하기';
    try {
      const result = await discoverRequest('publication/' + encodeURIComponent(id));
      publicationStates.set(id, result.exists);
      if (document.body.dataset.page === 'projectHome' && project?.id === id) {
        publishButton.textContent = result.exists ? '공개 관리' : '공개하기';
      }
    } catch {}
  }
  new MutationObserver(refreshPublicationLabel).observe(document.body, {
    attributes: true, attributeFilter: ['data-page']
  });
  refreshPublicationLabel();

  function publishError(error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  }

  function selectedEpisodes() {
    return Array.from(episodeList.querySelectorAll('input[data-publication-select]:checked'), input => Number(input.value));
  }

  function updateSelection() {
    const selected = selectedEpisodes();
    const count = selected.length;
    stopButton.hidden = !source.publication?.active || count === 0;
    selectAll.checked = count > 0 && count === source.episodes.length;
    selectAll.indeterminate = count > 0 && count < source.episodes.length;
    for (const input of episodeList.querySelectorAll('[data-publication-update]')) {
      input.disabled = !selected.includes(Number(input.value));
    }
    const previous = source.episodes.filter(ep => ep.published).map(ep => ep.number);
    const changed = count !== previous.length || selected.some(number => !previous.includes(number));
    const updates = episodeList.querySelector('[data-publication-update]:checked:not(:disabled)');
    if (!source.publication) {
      submit.disabled = count === 0;
      submit.textContent = count ? '선택한 ' + count + '개 회차 공개하기' : '공개할 회차를 선택하세요';
    } else {
      submit.disabled = !source.publication.active && !count ||
        source.publication.active && !changed && !updates && !metadataInput.checked &&
        branchInput.checked === Boolean(source.publication.allowBranches);
      submit.textContent = !count ? '공개 중단하기' : !source.publication.active ? '공개 재개' :
        submit.disabled ? '변경 사항 없음' : '변경 사항 반영';
    }
    const intro = metadataInput.checked || !source.publication ? source : source.publication;
    detail.querySelector('h1').textContent = intro.title;
    detail.querySelector('.discover-text-cover span').textContent = intro.title;
    detail.querySelector('.discover-synopsis').textContent = intro.synopsis;
    const genres = detail.querySelector('.discover-work-genres');
    genres.replaceChildren(...intro.genres.map(genre => {
      const tag = document.createElement('span');
      tag.textContent = '#' + genre;
      return tag;
    }));
    if (published) {
      published.episodes = source.episodes.map(ep => {
        const update = episodeList.querySelector('[data-publication-update][value="' + ep.number + '"]');
        return ep.published && !update?.checked ? ep.published : ep;
      });
    }
  }

  function finishPublication() {
    if (stopDialog.open) stopDialog.close();
    publishPage.hidden = true;
    page.classList.remove('discover-publishing');
    publishPage.prepend(publicationBar);
    catalogBack.textContent = '← 작품 둘러보기';
    catalogBack.dataset.discoverAction = 'catalog';
    episodeList.querySelectorAll('input').forEach(input => input.remove());
    selectAll.checked = selectAll.indeterminate = false;
    metadataInput.checked = false;
    metadataChoice.hidden = true;
    stopButton.hidden = true;
    errorMessage.hidden = true;
    errorMessage.textContent = '';
    catalogError.hidden = true;
  }

  function returnToProject() {
    finishPublication();
    showView(catalog);
    show('projectHome');
    publishButton.focus();
  }

  cancel.onclick = returnToProject;
  page.addEventListener('click', event => {
    if (event.target.closest('[data-discover-action="publication-cancel"]')) returnToProject();
  });
  episodeList.addEventListener('change', () => {
    if (!publishPage.hidden) updateSelection();
  });
  selectAll.onchange = () => {
    for (const input of episodeList.querySelectorAll('[data-publication-select]')) input.checked = selectAll.checked;
    updateSelection();
  };
  metadataInput.onchange = updateSelection;
  branchInput.onchange = updateSelection;

  publishButton.onclick = async () => {
    if (!project?.id) return;
    selectedProjectId = project.id;
    source = null;
    errorMessage.hidden = true;
    submit.disabled = true;
    submit.textContent = '공개할 회차를 선택하세요';
    selectAll.checked = selectAll.indeterminate = false;
    publishButton.disabled = true;
    try {
      source = await discoverRequest('publishable/' + encodeURIComponent(selectedProjectId));
      finishPublication();
      setCollection('all');
      show('discover');
      openWork(null, {...source, author: account?.nickname || '작가',
        status: source.publication?.status || '연재중',
        likes: source.publication?.likes || 0, views: source.publication?.views || 0});
      publishPage.hidden = false;
      page.classList.add('discover-publishing');
      detail.querySelector('.discover-detail-tabs').after(publicationBar);
      publicationBar.hidden = false;
      page.style.setProperty('--publication-cover', projectCoverColor(selectedProjectId));
      stopButton.hidden = !source.publication?.active;
      metadataChoice.hidden = !source.metadataChanged;
      branchInput.checked = Boolean(source.publication?.allowBranches);
      publicationStates.set(selectedProjectId, Boolean(source.publication));
      catalogBack.textContent = '← 작품 개요';
      catalogBack.dataset.discoverAction = 'publication-cancel';
      for (const item of episodeList.children) {
        const button = item.querySelector('button');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = button.dataset.episode;
        input.dataset.publicationSelect = '';
        const episode = source.episodes.find(ep => ep.number === Number(input.value));
        input.checked = Boolean(episode.published);
        input.setAttribute('aria-label', button.querySelector('.discover-episode-number').textContent + ' 공개');
        item.prepend(input);
        const state = document.createElement('span');
        state.className = 'discover-publication-state';
        state.textContent = episode.changed ? '수정됨' : episode.published ?
          source.publication.active ? '공개 중' : '공개 중단' : '미공개';
        item.append(state);
        if (episode.changed) {
          const label = document.createElement('label');
          label.className = 'discover-update-choice';
          const update = document.createElement('input');
          update.type = 'checkbox';
          update.value = episode.number;
          update.dataset.publicationUpdate = '';
          label.append(update, '수정본 반영');
          item.append(label);
        }
      }
      selectAll.disabled = source.episodes.length === 0;
      if (!source.episodes.length) publishError(new Error('공개할 확정 회차가 없어요.'));
      updateSelection();
    } catch (error) {
      show('discover');
      showView(catalog);
      showCatalogError(error);
    } finally {
      publishButton.disabled = false;
    }
  };

  async function applyPublication(episodes) {
    if (!source) return;
    const updates = Array.from(episodeList.querySelectorAll('[data-publication-update]:checked'),
      input => Number(input.value)).filter(number => episodes.includes(number));
    errorMessage.hidden = true;
    submit.disabled = cancel.disabled = selectAll.disabled = stopButton.disabled = metadataInput.disabled = true;
    const controls = [...episodeList.querySelectorAll('input'), catalogBack, branchInput];
    for (const control of controls) control.disabled = true;
    try {
      const result = await discoverRequest('publish', {
        project: selectedProjectId, revision: source.revision, episodes,
        updateEpisodes: updates,
        updateMetadata: !source.publication || metadataInput.checked,
        allowBranches: branchInput.checked,
        publicationUpdated: source.publication?.updated ?? null
      });
      publicationStates.set(selectedProjectId, true);
      finishPublication();
      setCollection('all');
      showView(catalog);
      status.value = '';
      sort.value = 'recent';
      for (const genre of genres) genre.checked = false;
      await loadPublicCatalog();
      if (source.origin && episodes.length) {
        try {
          await openBranchWork(source.origin.id);
          selectDetailTab('alternatives');
        } catch {
          await openBranchWork(result.id);
        }
        return;
      }
      const card = cards.find(item => item.dataset.publicId === result.id);
      if (card) card.querySelector('button').focus();
    } catch (error) {
      if (publishPage.hidden) showCatalogError(error);
      else publishError(error);
    } finally {
      cancel.disabled = selectAll.disabled = stopButton.disabled = metadataInput.disabled = false;
      for (const control of controls) control.disabled = false;
      if (!publishPage.hidden) updateSelection();
    }
  }
  submit.onclick = () => {
    if (submit.disabled) return;
    const episodes = selectedEpisodes();
    if (!episodes.length && source?.publication) stopDialog.showModal();
    else applyPublication(episodes);
  };
  stopButton.onclick = () => stopDialog.showModal();
  stopDialog.querySelector('[data-stop-cancel]').onclick = () => stopDialog.close();
  stopDialog.querySelector('[data-stop-confirm]').onclick = () => {
    stopDialog.close();
    applyPublication([]);
  };
  window.storyloomNavigation?.register('discover', {
    capture() {
      return {
        collection, screen: !reader.hidden ? 'reader' : !detail.hidden ? 'detail' : 'catalog',
        work: published?.id || null,
        episode: readerEpisode || null,
        tab: detail.querySelector('[data-discover-action][aria-pressed="true"]')?.dataset.discoverAction || 'episodes',
        genres: genres.filter(input => input.checked).map(input => input.value),
        status: status.value, sort: sort.value, likedSort: likedSort.value,
        publication: !publishPage.hidden,
        project: !publishPage.hidden ? selectedProjectId : null,
        selected: !publishPage.hidden ? selectedEpisodes() : [],
        updates: !publishPage.hidden ? Array.from(episodeList.querySelectorAll('[data-publication-update]:checked'),
          input => Number(input.value)) : [],
        metadata: !publishPage.hidden && metadataInput.checked,
        allowBranches: !publishPage.hidden && branchInput.checked
      };
    },
    async restore(view = {}) {
      finishPublication();
      if (view.publication) {
        await openProjectHome(view.project);
        await publishButton.onclick();
        for (const input of episodeList.querySelectorAll('[data-publication-select]')) {
          input.checked = (view.selected || []).includes(Number(input.value));
        }
        for (const input of episodeList.querySelectorAll('[data-publication-update]')) {
          input.checked = (view.updates || []).includes(Number(input.value));
        }
        metadataInput.checked = Boolean(view.metadata);
        if (typeof view.allowBranches === 'boolean') branchInput.checked = view.allowBranches;
        updateSelection();
      } else {
        setCollection(view.collection === 'liked' && account?.logged_in ? 'liked' : 'all');
        likedSort.value = view.likedSort || 'liked';
        await loadPublicCatalog();
        if (view.work && view.screen !== 'catalog') {
          const work = await discoverRequest('works/' + encodeURIComponent(view.work));
          const card = cards.find(item => item.dataset.publicId === view.work);
          openWork(card || null, work);
        } else showView(catalog);
      }
      for (const genre of genres) genre.checked = (view.genres || []).includes(genre.value);
      allGenres.checked = !genres.some(genre => genre.checked);
      status.value = view.status || '';
      sort.value = view.sort || 'recent';
      updateCards();
      selectDetailTab(['comments', 'alternatives'].includes(view.tab) ? view.tab : 'episodes');
      if (view.screen === 'reader' && published?.episodes.some(ep => ep.number === view.episode)) {
        openEpisode(view.episode);

      }
    }
  });
  loadPublicCatalog().catch(showCatalogError);
})();
