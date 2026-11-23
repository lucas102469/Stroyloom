// The real workbench template and scripts, with isolated public example data.
// No real account, browser recovery storage, API key or generation endpoint is used.
(() => {
  window.STORYLOOM_PREVIEW = true;
  document.body.classList.add("public-workspace-preview");
  const storage = new Map();
  window.STORYLOOM_PREVIEW_STORAGE = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  const text = '창밖으로 마지막 별이 떨어졌다. 유진은 등대의 불을 밝히고, 오래된 지도를 펼쳤다.\n\n바다는 고요했다. 멀리 수평선 너머로 낯선 빛 하나가 떠올랐다. 어머니가 남긴 편지에는 별이 사라지는 날, 아무도 없는 섬으로 가야 한다고 적혀 있었다.\n\n“아직 늦지 않았어.”\n\n그는 낡은 배의 밧줄을 풀었다. 잔잔한 물결이 발끝을 적셨다. 유진은 등대를 한 번 돌아보고 어둠 속으로 노를 저었다.';
  const project = {
    id: 'preview', title: '별이 잠든 바다', jobs: [],
    state: {
      selected: 'episode', episode: 1, archived: false,
      settings: {target_chars: 4000, total_episodes: 30},
      official: {}, drafts: {'episode:1': {text, version: 1, status: 'review'}},
      messages: [
        {role: 'assistant', text: '어떤 이야기를 함께 쓸까요? 떠오르는 장면부터 편하게 알려주세요.'},
        {role: 'user', text: '별이 사라진 바다에서 등대지기가 마지막 빛을 찾는 이야기를 쓰고 싶어.'},
        {role: 'assistant', text: '좋아요. 기획과 설정을 바탕으로 1화 초안을 작성했어요. 오른쪽에서 읽고, 수정하고 싶은 부분을 알려주세요.'}
      ]
    }
  };
  const stage = new URLSearchParams(location.search).get('stage') || 'plan';
  window.STORYLOOM_PREVIEW_STAGE = ['plan','characters','world','lore','plot','episode','review','complete'].includes(stage)?stage:'plan';
  const plan = '로그라인: 별이 사라진 바다에서 등대지기 유진이 마지막 빛을 찾아 떠나는 이야기.\n장르: 판타지\n총 회차: 30화\n회차 목표: 4,000자\n\n## 시놉시스\n어느 밤, 하늘의 별들이 바다로 떨어진다. 유진은 어머니가 남긴 지도를 따라 이름 없는 섬으로 향한다. 그곳에서 빛을 지키는 여행자 하린을 만나, 사라진 별의 비밀을 함께 추적한다.';
  const characters = '## 등대지기 유진\n역할: 주인공\n성격: 신중하고 책임감이 강하다.\n목표: 사라진 별을 찾아 바다의 빛을 되돌리는 것.\n관계: 하린과 동행하며 서로를 신뢰하게 된다.\n\n## 여행자 하린\n역할: 동행자\n성격: 호기심이 많고 낯선 이에게도 다정하다.\n목표: 별을 잃어버린 섬의 진실을 밝히는 것.\n관계: 유진이 섬에 도착하도록 돕는다.';
  const selected = window.STORYLOOM_PREVIEW_STAGE;
  project.state.official['plan:0'] = {text:plan,version:1,status:'confirmed'};
  project.state.official['characters:0'] = {text:characters,version:2,status:'confirmed'};
  project.state.messages = [{role:'user',text:'별이 사라진 바다에서 마지막 빛을 찾는 이야기를 쓰고 싶어.'}];
  if(selected==='plan'){project.state.selected='plan';delete project.state.official['plan:0'];project.state.drafts={'plan:0':{text:plan,version:3,status:'draft'}};project.state.messages.push({role:'assistant',text:'이야기의 방향을 기획안으로 정리했어요. 로그라인과 시놉시스를 확인하고 함께 다듬어볼까요?'});}
  else if(selected==='characters'){project.state.selected='characters';project.state.drafts={'characters:0':{text:'## 여행자 하린\n역할: 동행자\n성격: 호기심이 많고, 위험 앞에서도 침착하다.\n목표: 섬의 진실을 밝히고 잃어버린 가족을 찾는 것.\n관계: 유진과 서로의 비밀을 나누며 신뢰를 쌓는다.',version:3,status:'draft'}};project.state.messages.push({role:'assistant',text:'확정한 인물 설정과 새로 제안한 설정을 나누어 정리했어요. 승인하기 전까지 기존 설정은 유지돼요.'});}
  else {project.state.selected='episode';project.state.drafts={'episode:1':{text,version:3,status:selected==='review'?'review':'draft'}};if(selected==='review'){project.state.official['episode:1']={text:text.replace('마지막 별','작은 빛'),version:2,status:'confirmed'};project.state.messages.push({role:'user',text:'첫 문장을 더 인상적으로 바꿔줘.'},{role:'assistant',text:'첫 문장을 수정했어요. 기존 원고와 수정 원고를 확인하고 마음에 들면 승인해주세요.'});}else if(selected==='complete'){project.state.official['episode:1']={text,version:3,status:'confirmed'};project.state.drafts={};project.state.messages.push({role:'assistant',text:'1화가 공식 원고로 확정되었어요. 저장된 원고를 이어 쓰거나 내보낼 수 있어요.'});}else project.state.messages.push({role:'assistant',text:'확정한 기획과 설정을 바탕으로 1화 초안을 준비했어요. 오른쪽에서 읽고 수정할 부분을 알려주세요.'});}
  const examples={world:'## 이름 없는 섬\n설명: 사라진 별빛이 모이는 바다 한가운데의 섬.\n배경: 등대가 꺼지는 밤에만 바닷길이 열린다.\n규칙: 별빛 없이 섬을 벗어나면 길을 잃는다.',lore:'## 별빛 나침반\n설명: 어머니가 유진에게 남긴 작은 나침반.\n배경: 마지막 별이 떨어진 방향을 가리킨다.\n규칙: 빛을 되돌려줄 때마다 기억 하나가 사라진다.',plot:'## 전체 플롯\n| 구간 | 흐름 |\n| --- | --- |\n| 1막 · 출발 (1~10화) | 별이 사라지고 유진이 섬으로 떠난다. |\n| 2막 · 비밀 (11~20화) | 하린과 함께 별빛 나침반의 대가를 알아낸다. |\n| 3막 · 선택 (21~30화) | 기억과 빛 사이에서 선택하고 바다를 구한다. |\n\n## 회차 구성\n| 회차 | 제목 | 주요 사건 |\n| --- | --- | --- |\n| 1화 | 마지막 별 | 등대지기 유진이 어머니의 지도를 발견한다. |\n| 2화 | 이름 없는 섬 | 섬에 도착한 유진이 여행자 하린을 만난다. |\n| 3화 | 나침반의 대가 | 별빛을 되찾으며 기억이 희미해진다. |'};
  if(examples[selected]){project.state.selected=selected;project.state.drafts={[selected+':0']:{text:examples[selected],version:3,status:'draft'}};project.state.messages=[{role:'user',text:'기획한 이야기를 바탕으로 '+({world:'세계관',lore:'주요 설정',plot:'플롯과 회차 구성'})[selected]+'을 정리해줘.'},{role:'assistant',text:'이야기에 필요한 자료를 항목별로 정리했어요. 오른쪽에서 검토한 뒤 승인할 수 있어요.'}];}
  window.fetch = async (input, options = {}) => {
    const path = new URL(String(input), location.origin).pathname;
    if (options.method && options.method !== 'GET') {
      return new Response(JSON.stringify({error: '소개 페이지의 읽기 전용 예시입니다.'}), {status: 403});
    }
    let data;
    if (path === '/api/auth/session') data = {logged_in: true, required: false, nickname: '예시 작가'};
    else if (path === '/api/projects') data = [{id: 'preview', title: project.title}];
    else if (path === '/api/projects/preview') data = project;
    else if (path === '/api/projects/preview/versions' || path === '/api/projects/preview/versions?kind=episode') data = [];
    else if (path === '/api/usage') data = {used: 0, limit: 30, remaining: 30};
    else return new Response(JSON.stringify({error: '읽기 전용 예시'}), {status: 404});
    return new Response(JSON.stringify(data), {headers: {'Content-Type': 'application/json'}});
  };
})();
