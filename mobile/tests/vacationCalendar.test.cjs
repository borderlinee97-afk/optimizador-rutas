const test = require('node:test')
const assert = require('node:assert/strict')
const { loadTs, hooks } = require('./helpers/loadTs.cjs')
const jsx = (type, props) => ({ type, props })
function setup() {
  const runner = hooks(), changes = []
  let props = {start:'',end:'',disabled:false,onChange:(start,end)=>{changes.push({start,end});props={...props,start,end}}}
  let dismissed = 0
  const mod = loadTs('src/components/VacationDateRangePicker.tsx', {
    ...runner.modules, 'react/jsx-runtime': {jsx,jsxs:jsx},
    '@expo/vector-icons':{Ionicons:'Icon'},
    'react-native':{Keyboard:{dismiss(){dismissed++}},Pressable:'Button',Text:'Text',View:'View'},
  })
  runner.mount(()=>({props:{value:mod.VacationDateRangePicker(props)}}))
  function nodes(node) {
    if(!node || typeof node!=='object')return []
    if(Array.isArray(node))return node.flatMap(n=>nodes(n))
    return [node,...nodes(node.props?.children)]
  }
  const textOf = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join('') : node && typeof node==='object' ? textOf(node.props?.children) : ''
  function button(label) {const found=nodes(runner.value).find(n=>n.type==='Button'&&(n.props.accessibilityLabel===label||textOf(n)===label));assert.ok(found,'Missing button '+label);return found}
  async function press(label){const n=button(label);assert.ok(!n.props.disabled,'Disabled button '+label);n.props.onPress();await runner.flush()}
  return {runner,mod,changes,press,button,update(next){props={...props,...next};runner.rerender()},get dismissed(){return dismissed}}
}

test('calendar aligns Monday weeks and handles leap years, month and year boundaries',()=>{
  const {mod}=setup()
  const feb=mod.calendarDays('2028-02');assert.equal(feb.filter(Boolean).length,29);assert.equal(feb[1],'2028-02-01');assert.equal(feb.length%7,0)
  assert.equal(mod.calendarDays('2026-02').filter(Boolean).length,28)
  assert.equal(mod.calendarDays('2026-11')[6],'2026-11-01')
  assert.equal(mod.moveCalendarMonth('2026-12',1),'2027-01');assert.equal(mod.moveCalendarMonth('2027-01',-1),'2026-12')
})

test('selection accepts a single day, resets an inverted range and starts a new range after completion',()=>{
  const {selectVacationDay:pick}=setup().mod
  assert.deepEqual({...pick('','','2026-11-03')},{start:'2026-11-03',end:''})
  assert.deepEqual({...pick('2026-11-03','','2026-11-03')},{start:'2026-11-03',end:'2026-11-03'})
  assert.deepEqual({...pick('2026-11-03','','2026-11-02')},{start:'2026-11-02',end:''})
  assert.deepEqual({...pick('2026-11-03','2026-11-05','2026-12-01')},{start:'2026-12-01',end:''})
})

test('actual calendar confirms a range spanning months only after both dates are chosen',async()=>{
  const h=setup();h.update({start:'2026-11-29',end:''});await h.runner.flush()
  await h.press('Periodo de vacaciones. Seleccionar fechas');assert.equal(h.dismissed,1)
  assert.equal(h.button('Confirmar fechas').props.disabled,true)
  await h.press('Mes siguiente');await h.press('02/12/2026')
  assert.equal(h.changes.length,0)
  await h.press('Confirmar fechas');assert.deepEqual(h.changes,[{start:'2026-11-29',end:'2026-12-02'}])
  h.button('Periodo de vacaciones. Del 29/11/2026 al 02/12/2026')
})

test('cancel discards the draft and reopening restores the saved range; busy disables editing',async()=>{
  const h=setup();h.update({start:'2026-11-02',end:'2026-11-06'});await h.runner.flush()
  const title='Periodo de vacaciones. Del 02/11/2026 al 06/11/2026'
  await h.press(title);await h.press('10/11/2026');assert.equal(h.button('Confirmar fechas').props.disabled,true)
  await h.press('Cancelar');assert.equal(h.changes.length,0)
  await h.press(title);h.button('02/11/2026, inicio');h.button('06/11/2026, término')
  h.update({disabled:true});await h.runner.flush();assert.equal(h.button('Mes siguiente').props.disabled,true);assert.equal(h.button('Confirmar fechas').props.disabled,true)
})

test('vacation form sends confirmed ISO range and comment through the existing endpoint',async()=>{
  const runner=hooks(),sent=[],alerts=[]
  const auth={session:{access_token:'test',user:{id:'account-a'}},profile:{rol:'SUPERVISOR',area:'FARMACIAS'},accessState:'online'}
  const mod=loadTs('src/components/AvailabilityPanel.tsx',{
    ...runner.modules,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
    'expo-router':{useFocusEffect:fn=>runner.modules.react.useEffect(fn,[fn])},
    '@expo/vector-icons':{Ionicons:'Icon'},
    'react-native':{ActivityIndicator:'Spinner',Alert:{alert:(...args)=>alerts.push(args)},Pressable:'Button',Text:'Text',TextInput:'Input',View:'View'},
    'expo-crypto':{randomUUID:()=> 'request-key'},'../context/AuthContext':{useAuth:()=>auth},
    './VacationDateRangePicker':{VacationDateRangePicker:'Calendar'},
    '../lib/api':{apiRequest:async(path,options)=>{if(options.method==='POST'){sent.push({path,body:JSON.parse(options.body)});return {}}return {enabled:true,canRequest:true,requests:[]}}},
  })
  runner.mount(()=>({props:{value:mod.AvailabilityPanel()}}))
  function nodes(n){return !n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]}
  const find=(type,label)=>{const n=nodes(runner.value).find(n=>n.type===type&&(!label||n.props.accessibilityLabel===label));assert.ok(n,label||type);return n}
  await runner.flush();find('Button','Mostrar vacaciones').props.onPress();await runner.flush()
  find('Calendar').props.onChange('2026-11-02','2026-11-06');find('Input','Motivo o comentario de la solicitud de vacaciones').props.onChangeText('Descanso familiar');await runner.flush()
  const submit=nodes(runner.value).find(n=>n.type==='Button'&&n.props.children?.props?.children==='Enviar solicitud');assert.ok(submit)
  submit.props.onPress();await runner.flush()
  assert.deepEqual(sent,[{path:'/api/mobile/availability',body:{id:'request-key',startDate:'2026-11-02',endDate:'2026-11-06',comment:'Descanso familiar'}}])
  assert.equal(alerts.length,1);assert.equal(find('Calendar').props.start,'');assert.equal(find('Calendar').props.end,'')
  auth.session={...auth.session,user:{id:'account-b'}};runner.rerender();await runner.flush();assert.equal(runner.value,null)
})
