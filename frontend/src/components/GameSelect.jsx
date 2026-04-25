import './GameSelect.css'

const MENUS = {
  exercise: {
    title: 'Choose Your Exercise',
    sub: 'Pick a movement, then choose a game.',
    onBackTo: null,
    cards: [
      {
        screen: 'bicep-select',
        icon: '💪',
        title: 'Bicep Curls',
        desc: 'Curl-driven games.\nCorridor, Basketball, Tracker.',
      },
      {
        screen: 'lateral-select',
        icon: '🪽',
        title: 'Lateral Raises',
        desc: 'Side-raise games.\nMeteor Shield, Ring Pop, Wing Balance.',
      },
    ],
  },
  bicep: {
    title: 'Bicep Curl Games',
    sub: 'Curl up to play.',
    onBackTo: 'exercise-select',
    cards: [
      { screen: 'runner',     icon: '〰️', title: 'Corridor',   desc: 'Stay between the lines.\nCurl up, relax down.' },
      { screen: 'basketball', icon: '🏀', title: 'Basketball', desc: 'Aim the hoop with your curl.\nFull curl to reach.' },
      { screen: 'tracker',    icon: '📊', title: 'Tracker',    desc: 'Classic rep counter.\nScore reps, track form.' },
    ],
  },
  lateral: {
    title: 'Lateral Raise Games',
    sub: 'Raise your arm to play (Z-axis).',
    onBackTo: 'exercise-select',
    cards: [
      { screen: 'lateral-raise',  icon: '🎯', title: 'Tracker',       desc: 'Lift to band, hold, lower.\nClassic raise practice.' },
      { screen: 'meteor-shield',  icon: '☄️', title: 'Meteor Shield', desc: 'Match the meteor height.\nBlock incoming hits.' },
      { screen: 'ring-pop',       icon: '⭕', title: 'Ring Pop',      desc: 'Line up with floating rings.\nPop them as they pass.' },
      { screen: 'wing-balance',   icon: '🕊️', title: 'Wing Balance',  desc: 'Hold inside a drifting band.\nSteady wins.' },
    ],
  },
}

export default function GameSelect({ mode = 'exercise', onSelect }) {
  const menu = MENUS[mode] ?? MENUS.exercise
  return (
    <div className="gs-root">
      <h1 className="gs-title">{menu.title}</h1>
      <p className="gs-sub">{menu.sub}</p>
      <div className="gs-cards">
        {menu.cards.map((c) => (
          <button key={c.screen} className="gs-card" onClick={() => onSelect(c.screen)}>
            <div className="gs-icon">{c.icon}</div>
            <div className="gs-card-title">{c.title}</div>
            <div className="gs-card-desc">
              {c.desc.split('\n').map((line, i) => (
                <span key={i}>{line}<br /></span>
              ))}
            </div>
          </button>
        ))}
      </div>
      {menu.onBackTo && (
        <button className="gs-back" onClick={() => onSelect(menu.onBackTo)}>← Back</button>
      )}
    </div>
  )
}
