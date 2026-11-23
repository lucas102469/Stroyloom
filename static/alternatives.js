// Entry points for alternative stories; the writing workflow stays unchanged.
window.openAlternativeProject = async function(id) {
  safeMove();
  clearTimeout(pollTimer);
  activeJob = null;
  pid = id;
  editKey = null;
  documentView = 'preview';
  $('editPanel').hidden = true;
  await load();
  local.setItem('storyloom.project', id);
  show('work');
  window.scrollTo(0, 0);
};

function alternativeOriginLabel(origin) {
  const label = document.createElement('p');
  label.className = 'alternative-library-origin';
  label.textContent = '다른 줄거리 · ' + origin.author + ' 원작 · ' + origin.episode + '화부터';
  return label;
}

const renderHomeBeforeAlternatives = renderProjectHome;
renderProjectHome = function() {
  renderHomeBeforeAlternatives();
  $('projectHome').querySelector('.alternative-library-origin')?.remove();
  if (project.state.branch_origin) {
    $('projectHomeGenre').after(alternativeOriginLabel(project.state.branch_origin));
  }
};
if (project?.state?.branch_origin && document.body.dataset.page === 'projectHome') renderProjectHome();
