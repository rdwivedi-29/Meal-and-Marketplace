(function(){
  function $(q,c=document){return c.querySelector(q)}
  function $$(q,c=document){return Array.from(c.querySelectorAll(q))}
  function injectStyles(){
    if($('#profile-popover-styles'))return
    const css=`
.menu-portal{position:fixed;z-index:1000;min-width:220px;max-width:320px;border:1px solid #232633;border-radius:12px;background:#15171d;color:#eaeef7;box-shadow:0 8px 24px rgba(0,0,0,.25),0 2px 8px rgba(0,0,0,.2);padding:8px;transform-origin:top;opacity:0;transform:scale(.98);transition:opacity 120ms ease,transform 120ms ease;max-height:min(60vh,420px);overflow:auto}
.menu-portal.open{opacity:1;transform:scale(1)}
.menu-portal .menu-item{width:100%;display:grid;grid-template-columns:20px 1fr;gap:8px;align-items:center;padding:10px 12px;font-size:14px;color:inherit;background:transparent;border:0;border-radius:8px;text-align:left;cursor:pointer}
.menu-portal .menu-item:hover{background:rgba(255,255,255,.06)}
.menu-portal .menu-item.danger{color:#ffd1d3;background:rgba(255,90,95,.08)}
.menu-portal .menu-sep{height:1px;border:0;background:#232633;margin:6px 0}
    `.trim()
    const style=document.createElement('style')
    style.id='profile-popover-styles'
    style.textContent=css
    document.head.appendChild(style)
  }
  function ensureRoot(){
    let root=$('#menu-root')
    if(!root){
      root=document.createElement('div')
      root.id='menu-root'
      document.body.appendChild(root)
    }
    return root
  }
  function init(){
    injectStyles()
    const profileBtn=$('#profileBtn')
    const originalMenu=$('#profileMenu')
    if(!profileBtn||!originalMenu){return}
    const root=ensureRoot()
    originalMenu.classList.add('menu-portal')
    originalMenu.setAttribute('role','menu')
    originalMenu.setAttribute('hidden','')
    root.appendChild(originalMenu)
    let open=false
    let lastFocus=null
    let openedAt=0
    function position(){
      const rect=profileBtn.getBoundingClientRect()
      const gutter=8
      const vw=window.innerWidth
      const vh=window.innerHeight
      const minWidth=Math.max(220,rect.width+40)
      originalMenu.style.minWidth=minWidth+'px'
      let left=rect.left
      if(left+minWidth>vw-gutter)left=Math.max(gutter,vw-gutter-minWidth)
      let top=rect.bottom+8
      const prevDisp=originalMenu.style.display
      const prevVis=originalMenu.style.visibility
      originalMenu.style.visibility='hidden'
      originalMenu.style.display='block'
      const mh=originalMenu.offsetHeight||0
      originalMenu.style.display=prevDisp
      originalMenu.style.visibility=prevVis
      if(top+mh>vh-gutter)top=Math.max(gutter,vh-gutter-Math.min(mh,Math.floor(vh*.6)))
      originalMenu.style.left=left+'px'
      originalMenu.style.top=top+'px'
    }
    function openMenu(){
      if(open)return
      open=true
      lastFocus=document.activeElement
      position()
      originalMenu.removeAttribute('hidden')
      requestAnimationFrame(()=>{originalMenu.classList.add('open')})
      profileBtn.setAttribute('aria-expanded','true')
      openedAt=Date.now()
      setTimeout(()=>{document.addEventListener('click',onDocClick,true)},0)
      document.addEventListener('keydown',onKey)
      const first=originalMenu.querySelector('.menu-item,[role="menuitem"],button,a')
      if(first)first.focus()
    }
    function closeMenu(){
      if(!open)return
      open=false
      originalMenu.classList.remove('open')
      profileBtn.setAttribute('aria-expanded','false')
      document.removeEventListener('click',onDocClick,true)
      document.removeEventListener('keydown',onKey)
      setTimeout(()=>{originalMenu.setAttribute('hidden','')},120)
      if(lastFocus)lastFocus.focus()
    }
    function toggle(){
      if(open)closeMenu();else openMenu()
    }
    function onDocClick(e){
      if(Date.now()-openedAt<180)return
      if(originalMenu.contains(e.target))return
      if(profileBtn.contains(e.target))return
      closeMenu()
    }
    function onKey(e){
      if(e.key==='Escape'){e.preventDefault();closeMenu()}
      if(e.key==='ArrowDown'){e.preventDefault();focusNext(1)}
      if(e.key==='ArrowUp'){e.preventDefault();focusNext(-1)}
    }
    function focusNext(delta){
      const items=$$('.menu-item,[role="menuitem"],button,a',originalMenu).filter(n=>!n.disabled&&n.offsetParent!==null)
      if(!items.length)return
      const idx=Math.max(0,items.findIndex(n=>n===document.activeElement))
      const next=(idx+delta+items.length)%items.length
      items[next].focus()
    }
    originalMenu.setAttribute('hidden','')
    profileBtn.setAttribute('aria-haspopup','menu')
    profileBtn.addEventListener('click',function(e){e.stopPropagation();toggle()})
    window.addEventListener('resize',()=>{if(open)position()})
    window.addEventListener('scroll',()=>{if(open)position()},true)
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init)}else{init()}
})();

