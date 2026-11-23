(() => {
  if (window.STORYLOOM_PREVIEW) return;
  const providers = new Map();
  const saved = history.state?.storyloomRoute;
  let current = saved || null;
  let index = history.state?.storyloomIndex || 0;
  let restoring = false;
  let pendingRestore = Promise.resolve();
  let restoreSequence = 0;
  let scrollTimer;
  let recordQueued = false;
  let resolveFirstShow;
  const firstShow = new Promise(resolve => { resolveFirstShow = resolve; });
  history.scrollRestoration = 'manual';

  function snapshot() {
    const page = document.body.dataset.page;
    const route = {page};
    if (['projectHome', 'chapterReader', 'work'].includes(page)) route.project = pid;
    if (page === 'work' && project) {
      route.kind = project.state.selected;
      route.episode = project.state.episode;
    }
    if (page === 'chapterReader') route.episode = readingEpisode;
    if (providers.has(page)) route.view = providers.get(page).capture();
    return route;
  }

  function write(replace, route) {
    const state = {...history.state, storyloomRoute: route, storyloomIndex: index};
    if (replace) history.replaceState(state, '');
    else history.pushState(state, '');
  }

  function saveScroll() {
    if (!current || restoring) return;
    current = {...current, scroll: window.scrollY};
    write(true, current);
  }

  function recordNow() {
    if (restoring) return;
    const route = snapshot();
    const previous = current && {...current};
    if (previous) delete previous.scroll;
    if (JSON.stringify(previous) === JSON.stringify(route)) return;
    const first = !current;
    if (!first) index++;
    current = {...route, scroll: 0};
    write(first, current);
  }

  function record() {
    if (restoring || recordQueued) return;
    recordQueued = true;
    queueMicrotask(() => {
      recordQueued = false;
      recordNow();
    });
  }

  const originalShow = show;
  show = function(page) {
    saveScroll();
    originalShow(page);
    resolveFirstShow();
    record();
  };
  const originalSelect = select;
  select = async function(...args) {
    saveScroll();
    await originalSelect(...args);
    if (document.body.dataset.page === 'work') record();
  };

  async function restore(route) {
    safeMove();
    if (['projectHome', 'chapterReader', 'work'].includes(route.page)) {
      if (!account?.logged_in) {
        show('auth');
        return;
      }
      if (pid !== route.project || project?.id !== route.project) {
        await openProjectHome(route.project);
      }
      if (route.page === 'projectHome') {
        renderProjectHome();
        show('projectHome');
      } else if (route.page === 'chapterReader') {
        openChapterReader(route.episode);
      } else {
        await enterProjectWork(route.kind, route.episode);
      }
    } else if (route.page === 'libraryPage') {
      await library();
    } else if (providers.has(route.page)) {
      show(route.page);
      await providers.get(route.page).restore(route.view);
    } else {
      show(['home', 'auth', 'discover'].includes(route.page) ? route.page : 'home');
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.scrollTo({top: route.scroll || 0, behavior: 'instant'});
  }

  window.storyloomNavigation = {
    register(page, provider) { providers.set(page, provider); },
    record,
    saveScroll
  };

  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(saveScroll, 150);
  }, {passive: true});
  document.addEventListener('click', saveScroll, {capture: true});
  window.addEventListener('pagehide', saveScroll);
  window.addEventListener('popstate', event => {
    const route = event.state?.storyloomRoute;
    if (!route) return;
    const targetIndex = event.state.storyloomIndex || 0;
    const sequence = ++restoreSequence;
    pendingRestore = pendingRestore.then(async () => {
      if (sequence !== restoreSequence) return;
      const previousIndex = index;
      restoring = true;
      try {
        await restore(route);
        if (sequence !== restoreSequence) return;
        index = targetIndex;
        current = {...snapshot(), scroll: route.scroll || 0};
        write(true, current);
      } catch (error) {
        if (sequence !== restoreSequence) return;
        notice(error.message);
        if (previousIndex !== targetIndex) history.go(previousIndex - targetIndex);
      } finally {
        restoring = false;
      }
    });
  });

  if (saved) {
    restoring = true;
    window.addEventListener('load', async () => {
      try {
        await firstShow;
        await restore(saved);
        current = {...snapshot(), scroll: saved.scroll || 0};
        write(true, current);
      } catch (error) {
        notice(error.message);
        current = {...snapshot(), scroll: 0};
        write(true, current);
      } finally {
        restoring = false;
      }
    }, {once: true});
  }
})();
