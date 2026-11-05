import {catalog} from './catalog/api.mjs';
import {reviewRows, filterReviewRows} from './review-model.mjs';
const t = (key, data = {}) => game.i18n.localize(`TRUESIGHT.${key}`).replace(/\{([^}]+)\}/g, (token, name) => Object.hasOwn(data, name) ? String(data[name]) : token);
const node = (tag, text, cls) => {const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};
export function reviewWindowClass() {
 return class ReviewWindow extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS={classes:['truesight-review'],window:{title:'TRUESIGHT.Menu.Name',resizable:true,minimizable:true},position:{width:880,height:680}};
  constructor(options={}) {super({...options,window:{...options.window,title:t('Menu.Name')}});}
  async _renderHTML() {
   let view, preview=null, mode='current', filter='all', page=0, selected=null, busy=false;
   const root=node('div',null,'ts-review'), toolbar=node('header',null,'ts-toolbar'), tabs=node('nav',null,'ts-tabs'), filters=node('nav',null,'ts-filters');
   const message=node('p',null,'ts-message');message.setAttribute('role','status');
   const error=node('p',null,'ts-error');error.setAttribute('role','alert');
   const search=node('input');search.type='search';search.placeholder=t('Grouping.Find');search.setAttribute('aria-label',t('Grouping.Find'));
   const reason=node('select');reason.setAttribute('aria-label',t('UI.ReasonFilter'));reason.value='';
   const body=node('div',null,'ts-body'), rail=node('div',null,'ts-rail'), list=node('div',null,'ts-list'), pagination=node('nav',null,'ts-pagination'), detail=node('section',null,'ts-detail');
   detail.setAttribute('aria-label',t('UI.Details'));
   const footer=node('footer',null,'ts-footer'), summary=node('span'), actions=node('div',null,'ts-actions');
   const button=(key,action)=>{const b=node('button',t(key));b.type='button';b.onclick=async()=>{if(busy)return;busy=true;error.textContent='';refreshActions();try{await action();}catch(e){if(e.code==='preview-stale'){resetPreview();load();}error.textContent=t('Grouping.Error',{message:e.message});}finally{busy=false;render();}};return b;};
   const risk=node('input');risk.type='checkbox';risk.checked=catalog.getStatus().includeRisk;
   const options=node('details',null,'ts-options'), optionLabel=node('label');optionLabel.append(risk,node('span',t('Grouping.IncludeRisk')));options.append(node('summary',t('UI.Options')),optionLabel);
   const resetPreview=()=>{preview=null;mode='current';filter='all';page=0;selected=null;};
   const load=()=>{try{view=catalog.read();}catch(e){view=null;error.textContent=t('Grouping.Error',{message:e.message});}render();};
   const rebuild=button('UI.Recalculate',async()=>{message.textContent=t('UI.Computing');await catalog.whenReady();view=catalog.read();preview=catalog.preview({includeRisk:risk.checked});mode='preview';filter='changes';page=0;selected=null;render();});
   const current=button('UI.Current',()=>{mode='current';filter='all';page=0;selected=null;render();});
   const pending=button('UI.Preview',()=>{mode='preview';filter='changes';page=0;selected=null;render();});
   const discard=button('UI.Discard',()=>{resetPreview();render();});
   const apply=button('UI.Apply',async()=>{message.textContent=t('UI.Saving');await catalog.apply(preview.id);resetPreview();load();});apply.className='ts-primary';
   const undo=button('Grouping.Undo',async()=>{await catalog.undo();resetPreview();load();});
   const restore=button('Grouping.RestoreExcluded',async()=>{await catalog.restoreExcluded();resetPreview();load();});
   const excluded=button('UI.Excluded',()=>{mode='current';filter='excluded';page=0;selected=null;render();});
   const more=node('details',null,'ts-options');more.append(node('summary',t('UI.More')),excluded,undo,restore);
   toolbar.append(node('strong',t('Menu.Name')),options,rebuild,more);tabs.append(current,pending);
   const choices=['all','changes','added','adjusted','removed','risk','independent'];const filterButtons=new Map();
   for(const key of choices){const b=button(`UI.Filter.${key}`,()=>{filter=key;page=0;selected=null;render();});filterButtons.set(key,b);filters.append(b);}
   const prev=button('UI.Previous',()=>{page--;render();}), next=button('UI.Next',()=>{page++;render();}), pageLabel=node('span');pagination.append(prev,pageLabel,next);
   const refreshActions=()=>{const s=catalog.getStatus();rebuild.disabled=busy||!['ready','unreviewed'].includes(s.status);apply.disabled=busy||!preview||mode!=='preview';discard.disabled=busy;pending.disabled=busy||!preview;current.disabled=busy;undo.disabled=busy||!s.canUndo;restore.disabled=busy||!view?.excludedCount;risk.disabled=busy;for(const b of filterButtons.values())b.disabled=busy;};
   const member=(id)=>{const e=view.entries.get(id),card=node('article',null,'ts-member');card.append(node('strong',e?.names?.[0]??id));
    const source=e?.evidence?.source;const books=source?.references?.map(r=>r.record?.label??r.raw).filter(Boolean)??[];
    card.append(node('p',[...books,e?.rules,source?.packageName,source?.location].filter(Boolean).join(' · ')));
    const tech=node('details');tech.append(node('summary',t('UI.Technical')),node('code',id));const copy=button('UI.Copy',()=>navigator.clipboard.writeText(id));tech.append(copy);card.append(tech);return card;};
   const showDetail=row=>{detail.replaceChildren();if(!row){detail.append(node('p',t('UI.Select')));return;}
    detail.append(node('h2',row.name),node('p',[row.rules,t(`UI.Change.${row.change}`)].filter(Boolean).join(' · ')));
    if(row.risk)detail.append(node('p',t('UI.RiskHint'),'ts-risk'));
    detail.append(node('h3',t('UI.Basis')),node('p',t(row.independent?`Grouping.Review.${row.reason}`:`Grouping.Reason.${row.reason}`)));
    const first=view.entries.get(row.members[0]);if(first?.evidence)detail.append(node('p',[first.evidence.identifier,first.evidence.level!=null?t('UI.Level',{level:first.evidence.level}):null,first.evidence.school].filter(Boolean).join(' · ')));
    if(mode==='preview'&&['adjusted','removed'].includes(row.change)){detail.append(node('h3',t('UI.Before')));for(const old of row.previous){const section=node('section');section.append(node('p',t('UI.Members',{count:old.members.length})));for(const id of old.members)section.append(member(id));detail.append(section);}detail.append(node('h3',t('UI.After')));}
    if(row.change==='removed')detail.append(node('p',t('UI.Dissolved')));else for(const id of row.members)detail.append(member(id));
   };
   const render=()=>{
    const isPreview=mode==='preview'&&preview;current.setAttribute('aria-pressed',String(!isPreview));pending.setAttribute('aria-pressed',String(Boolean(isPreview)));
    apply.hidden=discard.hidden=!isPreview;
    message.textContent=isPreview?t('UI.PreviewHint'):t(view?.reviewed?'UI.CurrentHint':'UI.Empty');
    const focusedRow=document.activeElement?.getAttribute?.('data-row-key');
    list.replaceChildren();if(!view){detail.replaceChildren();summary.textContent='';prev.disabled=next.disabled=true;refreshActions();return;}
    const rows=reviewRows(view,isPreview?preview:null);
    reason.hidden=filter!=='independent';const reasonValue=reason.value;reason.replaceChildren();
    for(const key of ['',...new Set(rows.filter(r=>r.independent).map(r=>r.reason))]){const option=node('option',key?t('Grouping.Review.'+key):t('UI.AllReasons'));option.value=key;reason.append(option);}reason.value=reasonValue;
    const visible=filterReviewRows(rows,view,filter,search.value).filter(row=>filter!=='independent'||!reason.value||row.reason===reason.value);
    for(const [key,b]of filterButtons){b.hidden=!isPreview&&['changes','added','adjusted','removed'].includes(key);b.setAttribute('aria-pressed',String(filter===key));b.textContent=`${t('UI.Filter.'+key)} · ${filterReviewRows(rows,view,key).length}`;}
    page=Math.max(0,Math.min(page,Math.ceil(visible.length/50)-1));const slice=visible.slice(page*50,page*50+50);
    if(!slice.some(r=>r.key===selected))selected=slice[0]?.key;
    for(const row of slice){const b=button('UI.Select',()=>{selected=row.key;render();});b.className='ts-row';b.setAttribute('data-row-key',row.key);b.setAttribute('aria-pressed',String(selected===row.key));b.replaceChildren(node('strong',row.name),node('span',[row.rules,t('UI.Members',{count:row.members.length}),isPreview?t('UI.Change.'+row.change):row.risk?'⚠':''].filter(Boolean).join(' · ')));list.append(b);if(focusedRow===row.key)b.focus();}
    if(!slice.length)list.append(node('p',t('UI.NoResults')));
    prev.disabled=page===0;next.disabled=(page+1)*50>=visible.length;pageLabel.textContent=`${page+1} / ${Math.max(1,Math.ceil(visible.length/50))}`;
    summary.textContent=isPreview?t('UI.Diff',preview.diff):t('UI.Revision',{revision:view.revision,groups:view.groups.size});
    showDetail(slice.find(r=>r.key===selected));refreshActions();
   };
   reason.onchange=()=>{page=0;selected=null;render();};
   search.oninput=()=>{page=0;selected=null;render();};risk.onchange=()=>{if(preview){resetPreview();render();error.textContent=t('UI.Stale');}};
   rail.append(list,pagination);body.append(rail,detail);actions.append(discard,apply);footer.append(summary,actions);root.append(toolbar,tabs,message,search,filters,reason,error,body,footer);
   if(this.reviewHook)Hooks.off('truesightChanged',this.reviewHook);
   this.reviewHook=Hooks.on('truesightChanged',()=>{const stale=Boolean(preview);resetPreview();load();if(stale&&!busy)error.textContent=t('UI.Stale');});
   load();return root;
  }
  _replaceHTML(content,host){host.replaceChildren(content);}
  _onClose(options){Hooks.off('truesightChanged',this.reviewHook);this.reviewHook=null;super._onClose(options);}
 };
}
