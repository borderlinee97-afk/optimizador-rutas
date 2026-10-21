import { useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'

type Props = { visible:boolean; busy:boolean; onClose:()=>void; onSave:(activityType:string,note:string)=>Promise<void> }

export function AddVisitActivityModal({visible,busy,onClose,onSave}:Props) {
  const [title,setTitle]=useState(''),[note,setNote]=useState('')
  useEffect(()=>{if(!visible){setTitle('');setNote('')}},[visible])
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={()=>{if(!busy)onClose()}}>
    <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
      <View className="flex-1 justify-center bg-black/40 px-5">
        <View className="max-h-[90%] rounded-3xl bg-white p-5">
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text accessibilityRole="header" className="text-xl font-bold text-slate-900">Agregar actividad adicional</Text>
            <Text className="mt-2 text-sm leading-5 text-slate-600">Se agregará a esta visita sin modificar las actividades del plan. También puedes guardarla sin conexión.</Text>
            <Text className="mb-2 mt-5 font-semibold text-slate-800">Actividad</Text>
            <TextInput accessibilityLabel="Actividad adicional" value={title} onChangeText={setTitle} editable={!busy}
              maxLength={160} placeholder="¿Qué actividad necesitas realizar?" className="rounded-xl border border-slate-300 px-3 py-3 text-slate-900" />
            <Text className="mb-2 mt-4 font-semibold text-slate-800">Nota (opcional)</Text>
            <TextInput accessibilityLabel="Nota de la actividad adicional" value={note} onChangeText={setNote} editable={!busy}
              maxLength={1000} multiline textAlignVertical="top" placeholder="Detalles de la actividad"
              className="min-h-[100px] rounded-xl border border-slate-300 px-3 py-3 text-slate-900" />
            <View className="mt-5 flex-row gap-3">
              <Pressable accessibilityRole="button" onPress={onClose} disabled={busy} className="flex-1 items-center rounded-xl border border-slate-300 py-3">
                <Text className="font-bold text-slate-700">Cancelar</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busy||!title.trim()} onPress={()=>{void onSave(title.trim(),note.trim())}}
                className={`flex-1 items-center rounded-xl py-3 ${busy||!title.trim()?'bg-slate-300':'bg-primary-600'}`}>
                {busy?<ActivityIndicator color="#fff" />:<Text className="font-bold text-white">Agregar</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
}
