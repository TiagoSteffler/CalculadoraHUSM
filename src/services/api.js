import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc
} from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from './firebase'

const toEmail = (username) => {
  const clean = String(username || '').trim().toLowerCase()
  if (clean.includes('@')) {
    return clean
  }
  return `${clean}@husm.local`
}

// Remove undefined values to prevent Firestore serialization errors
const sanitizeForFirestore = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore)
  }

  const sanitized = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      sanitized[key] = sanitizeForFirestore(value)
    }
  }
  return sanitized
}

const mapAuthError = (error) => {
  const code = error?.code || ''
  switch (code) {
    case 'auth/configuration-not-found':
      return 'O serviço de Autenticação precisa ser iniciado no Firebase Console. Acesse "Authentication" > "Primeiros passos" e ative o método "E-mail/senha".'
    case 'auth/operation-not-allowed':
      return 'O método de login "E-mail/senha" não está ativado no Firebase Console. Ative-o em Authentication > Sign-in method.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Usuário ou senha incorretos. Verifique suas credenciais.'
    case 'auth/weak-password':
      return 'A senha deve conter no mínimo 6 caracteres.'
    case 'auth/email-already-in-use':
      return 'Este usuário já está cadastrado.'
    case 'auth/too-many-requests':
      return 'Muitas tentativas sem sucesso. Aguarde alguns instantes e tente novamente.'
    case 'auth/network-request-failed':
      return 'Falha de conexão com a rede. Verifique sua internet.'
    default:
      return error?.message || 'Falha ao autenticar no Firebase.'
  }
}

class MedicamentosFirebaseAPI {
  constructor() {
    this.token = null
  }

  setToken(token) {
    this.token = token
  }

  getToken() {
    return this.token
  }

  // Auth methods
  async login(username, senha) {
    const cleanUser = String(username || '').trim().toLowerCase()
    const email = toEmail(cleanUser)

    if (!isFirebaseConfigured) {
      console.warn('[Firebase] Usando login em modo fallback (Firebase não configurado).')
      const role = cleanUser === 'admin' ? 'ADMIN' : 'USER'
      const fakeToken = `offline-token-${Date.now()}`
      this.setToken(fakeToken)
      return {
        username: cleanUser,
        role,
        token: fakeToken
      }
    }

    try {
      let userCredential
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, senha)
      } catch (signInErr) {
        // Auto-provision standard accounts (admin / user) on first run if they don't exist yet
        if (
          signInErr.code === 'auth/user-not-found' ||
          signInErr.code === 'auth/invalid-credential'
        ) {
          if (cleanUser === 'admin' || cleanUser === 'user') {
            try {
              userCredential = await createUserWithEmailAndPassword(auth, email, senha)
              const defaultRole = cleanUser === 'admin' ? 'ADMIN' : 'USER'
              await setDoc(doc(db, 'users', userCredential.user.uid), {
                username: cleanUser,
                email,
                role: defaultRole,
                createdAt: new Date().toISOString()
              })
            } catch (createErr) {
              if (
                createErr.code === 'auth/configuration-not-found' ||
                createErr.code === 'auth/operation-not-allowed'
              ) {
                throw new Error(mapAuthError(createErr))
              }
              throw new Error('Falha ao fazer login. Verifique suas credenciais.')
            }
          } else {
            throw new Error('Falha ao fazer login. Verifique suas credenciais.')
          }
        } else {
          throw new Error(mapAuthError(signInErr))
        }
      }

      const uid = userCredential.user.uid
      const token = await userCredential.user.getIdToken()
      this.setToken(token)

      // Fetch user role from Firestore 'users' collection
      let role = cleanUser === 'admin' ? 'ADMIN' : 'USER'
      try {
        const userDocRef = doc(db, 'users', uid)
        const userDocSnap = await getDoc(userDocRef)

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data()
          role = userData.role || role
        } else {
          // Initialize doc if missing
          await setDoc(userDocRef, {
            username: cleanUser,
            email,
            role,
            createdAt: new Date().toISOString()
          })
        }
      } catch (e) {
        console.warn('Não foi possível ler o documento de perfil do usuário:', e)
      }

      return {
        username: cleanUser,
        role,
        token
      }
    } catch (error) {
      console.error('Erro de autenticação:', error)
      throw error
    }
  }

  async register(username, senha, role = 'USER') {
    const cleanUser = String(username || '').trim().toLowerCase()
    const email = toEmail(cleanUser)

    if (!isFirebaseConfigured) {
      return { username: cleanUser, role }
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, senha)
      const token = await userCredential.user.getIdToken()

      await setDoc(doc(db, 'users', userCredential.user.uid), {
        username: cleanUser,
        email,
        role: role.toUpperCase(),
        createdAt: new Date().toISOString()
      })

      return {
        username: cleanUser,
        role: role.toUpperCase(),
        token
      }
    } catch (error) {
      throw new Error(mapAuthError(error))
    }
  }

  async logout() {
    this.setToken(null)
    if (isFirebaseConfigured) {
      try {
        await signOut(auth)
      } catch (e) {
        console.warn('Erro ao deslogar do Firebase:', e)
      }
    }
  }

  // Medications CRUD endpoints
  async getMedications() {
    if (!isFirebaseConfigured) {
      return []
    }

    try {
      const colRef = collection(db, 'medicamentos')
      const snapshot = await getDocs(colRef)

      if (snapshot.empty) {
        return []
      }

      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }))
    } catch (error) {
      console.error('[Firebase] Erro ao buscar medicamentos no Firestore:', error)
      return []
    }
  }

  async getMedicationById(id) {
    if (!isFirebaseConfigured) {
      throw new Error('Medicamento não encontrado.')
    }

    const docRef = doc(db, 'medicamentos', id)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      throw new Error('Medicamento não encontrado.')
    }

    return {
      id: docSnap.id,
      ...docSnap.data()
    }
  }

  async createMedication(medicationData) {
    const id = medicationData.id
    if (!id) {
      throw new Error('ID do medicamento é obrigatório.')
    }

    const cleanData = sanitizeForFirestore({
      ...medicationData,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    if (!isFirebaseConfigured) {
      return cleanData
    }

    await setDoc(doc(db, 'medicamentos', id), cleanData)
    return cleanData
  }

  async updateMedication(id, medicationData) {
    if (!id) {
      throw new Error('ID do medicamento é obrigatório.')
    }

    const cleanData = sanitizeForFirestore({
      ...medicationData,
      id,
      updatedAt: new Date().toISOString()
    })

    if (!isFirebaseConfigured) {
      return cleanData
    }

    await setDoc(doc(db, 'medicamentos', id), cleanData, { merge: true })
    return cleanData
  }

  async deleteMedication(id) {
    if (!id) {
      throw new Error('ID do medicamento é obrigatório.')
    }

    if (isFirebaseConfigured) {
      await deleteDoc(doc(db, 'medicamentos', id))
    }

    return { success: true, id }
  }
}

export const api = new MedicamentosFirebaseAPI()
