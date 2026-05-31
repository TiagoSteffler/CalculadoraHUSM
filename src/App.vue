<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { api } from './services/api'

const AUTH_KEY = 'husm-auth'
const RECENT_KEY = 'husm-recent-searches'
const DEFAULT_IMAGE = '/images/ampola.svg'

const loginUser = ref('')
const loginPassword = ref('')
const loginError = ref('')
const loginLoading = ref(false)
const authUser = ref('')
const authRole = ref('')
const authToken = ref('')
const isAuthenticated = ref(false)
const activeView = ref('calculator')
const installPromptEvent = ref(null)
const isIosDevice = ref(false)
const isStandaloneMode = ref(false)
const canInstallApp = computed(() => Boolean(installPromptEvent.value))
const showInstallCard = computed(() => !isStandaloneMode.value)
let displayModeQuery = null
let adminLayoutQuery = null
let adminFormResizeObserver = null

const searchTerm = ref('')
const selectedMedication = ref(null)
const detailPanelRef = ref(null)
const recentSearches = ref([])
const medications = ref([])
const medicationsLoading = ref(false)
const medicationsError = ref('')

const prescribedMg = ref('')
const resultMl = ref('')
const redilutionResultMl = ref('')
const redilutionIntervalLabel = ref('')
const calcError = ref('')

const adminError = ref('')
const adminSuccess = ref('')
const adminLoading = ref(false)
const adminSearchTerm = ref('')
const editingMedicationId = ref('')
const adminFormRef = ref(null)
const adminListRef = ref(null)
const imageFileInputRef = ref(null)
const uploadedImageDataUrl = ref('')
const uploadedImageLabel = ref('')
const imageProcessing = ref(false)
const isSettingVariation = ref(false)
const variationAutoEnabled = ref(true)
const lastAutoVariation = ref('')
const createRedilutionInterval = () => ({
  operator: 'upTo',
  amountMg: '',
  volumeMl: ''
})

const detectIosDevice = () => {
  const ua = String(navigator?.userAgent ?? '').toLowerCase()
  const isApple = /iphone|ipad|ipod/.test(ua)
  const isTouchMac = ua.includes('mac') && 'ontouchend' in document
  return isApple || isTouchMac
}

const updateStandaloneMode = () => {
  const displayMode = window.matchMedia
    ? window.matchMedia('(display-mode: standalone)').matches
    : false
  const iosStandalone = window.navigator?.standalone === true
  isStandaloneMode.value = Boolean(displayMode || iosStandalone)
}

const handleBeforeInstallPrompt = (event) => {
  event.preventDefault()
  installPromptEvent.value = event
}

const handleAppInstalled = () => {
  installPromptEvent.value = null
  updateStandaloneMode()
}

const triggerInstall = async () => {
  const promptEvent = installPromptEvent.value
  if (!promptEvent) {
    return
  }

  promptEvent.prompt()
  await promptEvent.userChoice
  installPromptEvent.value = null
}

const resetAdminListSizing = () => {
  if (!adminListRef.value) {
    return
  }

  adminListRef.value.style.height = ''
  adminListRef.value.style.maxHeight = ''
  adminListRef.value.style.overflow = ''
}

const syncAdminListHeight = () => {
  if (!adminFormRef.value || !adminListRef.value || typeof window === 'undefined') {
    return
  }

  const isDesktop = window.matchMedia?.('(min-width: 1025px)').matches

  if (!isDesktop) {
    resetAdminListSizing()
    return
  }

  const height = Math.max(0, Math.round(adminFormRef.value.getBoundingClientRect().height))
  adminListRef.value.style.height = `${height}px`
  adminListRef.value.style.maxHeight = `${height}px`
  adminListRef.value.style.overflow = 'hidden'
}

const setupAdminListSync = () => {
  if (!canManage.value || activeView.value !== 'admin') {
    resetAdminListSizing()
    if (adminFormResizeObserver) {
      adminFormResizeObserver.disconnect()
      adminFormResizeObserver = null
    }
    return
  }

  if (!adminFormRef.value || !adminListRef.value || typeof window === 'undefined') {
    return
  }

  if ('ResizeObserver' in window) {
    if (adminFormResizeObserver) {
      adminFormResizeObserver.disconnect()
    }

    adminFormResizeObserver = new ResizeObserver(() => {
      syncAdminListHeight()
    })
    adminFormResizeObserver.observe(adminFormRef.value)
  }

  syncAdminListHeight()
}

const handleAdminLayoutChange = () => {
  syncAdminListHeight()
}

const newMedication = reactive({
  name: '',
  variation: '',
  volumeMl: '',
  amountMg: '',
  description: '',
  classes: '',
  reconstituition: '',
  redilutionIntervals: [createRedilutionInterval()],
  infusionTime: '',
  image: ''
})

const buildVariationLabel = (amount, volume) => {
  const amountText = String(amount ?? '').trim()
  const volumeText = String(volume ?? '').trim()

  if (!amountText || !volumeText) {
    return ''
  }

  return `${amountText} mg / ${volumeText} mL`
}

const syncVariationAutoState = () => {
  const label = buildVariationLabel(newMedication.amountMg, newMedication.volumeMl)
  lastAutoVariation.value = label
  const current = String(newMedication.variation ?? '').trim()
  variationAutoEnabled.value = !current || current === label
}

const isDataImageUrl = (value) =>
  typeof value === 'string' && value.trim().toLowerCase().startsWith('data:image/')

const inferMimeTypeFromBase64 = (base64) => {
  const head = String(base64 ?? '').slice(0, 10)

  if (head.startsWith('/9j/')) {
    return 'image/jpeg'
  }

  if (head.startsWith('iVBORw0KG')) {
    return 'image/png'
  }

  if (head.startsWith('R0lGOD')) {
    return 'image/gif'
  }

  if (head.startsWith('UklGR')) {
    return 'image/webp'
  }

  if (head.startsWith('PHN2Zy')) {
    return 'image/svg+xml'
  }

  return 'image/jpeg'
}

const looksLikeBase64 = (value) => {
  if (typeof value !== 'string') {
    return false
  }

  const cleaned = value.trim().replace(/\s+/g, '')

  if (cleaned.length < 80) {
    return false
  }

  return /^[A-Za-z0-9+/_-]+={0,2}$/.test(cleaned)
}

const normalizeBase64String = (value) => {
  const cleaned = String(value ?? '').trim().replace(/\s+/g, '')
  const standard = cleaned.replace(/-/g, '+').replace(/_/g, '/')
  const remainder = standard.length % 4

  if (remainder === 0) {
    return standard
  }

  return `${standard}${'='.repeat(4 - remainder)}`
}

const resolveImageSrc = (value) => {
  const raw = String(value ?? '').trim()

  if (!raw) {
    return DEFAULT_IMAGE
  }

  if (raw === DEFAULT_IMAGE) {
    return DEFAULT_IMAGE
  }

  if (isDataImageUrl(raw)) {
    return raw
  }

  if (/^https?:\/\//i.test(raw) || raw.startsWith('/') || raw.startsWith('./')) {
    return raw
  }

  if (looksLikeBase64(raw)) {
    const base64 = normalizeBase64String(raw)
    const mime = inferMimeTypeFromBase64(base64)
    return `data:${mime};base64,${base64}`
  }

  return raw
}

const isEncodedImageValue = (value) => isDataImageUrl(value) || looksLikeBase64(value)

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  })

const resizeImageToHdDataUrl = (dataUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => {
      const maxDimension = 1280
      const { width, height } = image

      if (!width || !height) {
        reject(new Error('Imagem inválida.'))
        return
      }

      const scale = Math.min(1, maxDimension / Math.max(width, height))
      const targetWidth = Math.max(1, Math.round(width * scale))
      const targetHeight = Math.max(1, Math.round(height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight

      const context = canvas.getContext('2d')

      if (!context) {
        reject(new Error('Canvas indisponível.'))
        return
      }

      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'

      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, targetWidth, targetHeight)
      context.drawImage(image, 0, 0, targetWidth, targetHeight)

      const jpegQuality = 0.85
      resolve(canvas.toDataURL('image/jpeg', jpegQuality))
    }

    image.onerror = () => reject(new Error('Falha ao carregar imagem.'))
    image.src = String(dataUrl ?? '')
  })

const resetImageUpload = () => {
  uploadedImageDataUrl.value = ''
  uploadedImageLabel.value = ''

  if (imageFileInputRef.value) {
    imageFileInputRef.value.value = ''
  }
}

const handleImageFileSelected = async (event) => {
  const input = event?.target
  const file = input?.files?.[0]

  if (!file) {
    return
  }

  if (!file.type?.startsWith('image/')) {
    adminError.value = 'Selecione um arquivo de imagem válido.'
    input.value = ''
    return
  }

  try {
    imageProcessing.value = true
    adminError.value = ''

    const dataUrl = await readFileAsDataUrl(file)
    const resized = await resizeImageToHdDataUrl(dataUrl)

    uploadedImageDataUrl.value = resized
    uploadedImageLabel.value = file.name
  } catch (error) {
    adminError.value = error?.message || 'Erro ao processar a imagem selecionada.'
    resetImageUpload()
  } finally {
    imageProcessing.value = false
  }
}

const removeUploadedImage = () => {
  resetImageUpload()
}

const toStringArray = (value) => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
}

const parseListInput = (value) =>
  String(value ?? '')
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)

const parseMultilineInput = (value) => {
  const raw = String(value ?? '').trim()

  if (!raw) {
    return []
  }

  if (raw.includes('\n')) {
    return raw
      .split(/\n/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const normalizeRedilutionIntervals = (value) => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      const operator = item?.operator === 'above' ? 'above' : 'upTo'
      const amountMg = Number(item?.amountMg ?? item?.mg ?? 0)
      const volumeMl = Number(item?.volumeMl ?? item?.ml ?? 0)

      return {
        operator,
        amountMg,
        volumeMl
      }
    })
    .filter((interval) => interval.amountMg > 0 && interval.volumeMl > 0)
}

const sortRedilutionIntervals = (intervals) => {
  const sorted = [...intervals].sort((a, b) => a.amountMg - b.amountMg)
  const upTo = sorted.filter((interval) => interval.operator !== 'above')
  const above = sorted.filter((interval) => interval.operator === 'above')
  return [...upTo, ...above]
}

const formatRedilutionIntervals = (intervals) => {
  const sorted = sortRedilutionIntervals(intervals)
  const lines = []
  let previousUpper = null

  sorted.forEach((interval) => {
    const amount = interval.amountMg
    const volume = interval.volumeMl

    if (interval.operator === 'above') {
      lines.push(`acima de ${amount}mg: ${volume}ml`)
      return
    }

    if (previousUpper) {
      lines.push(`de ${previousUpper}mg até ${amount}mg: ${volume}ml`)
    } else {
      lines.push(`até ${amount}mg: ${volume}ml`)
    }

    previousUpper = amount
  })

  return lines
}

const resolveRedilutionInterval = (doseMg, intervals) => {
  const sorted = sortRedilutionIntervals(intervals)
  let previousUpper = null

  for (const interval of sorted) {
    const amount = interval.amountMg
    const volume = interval.volumeMl
    let label = ''

    if (interval.operator === 'above') {
      label = `acima de ${amount}mg: ${volume}ml`

      if (doseMg > amount) {
        return { interval, label }
      }

      continue
    }

    label = previousUpper
      ? `de ${previousUpper}mg até ${amount}mg: ${volume}ml`
      : `até ${amount}mg: ${volume}ml`

    if (doseMg <= amount) {
      return { interval, label }
    }

    previousUpper = amount
  }

  return null
}

const normalizeMedication = (medication) => {
  if (!medication || typeof medication !== 'object') {
    return null
  }

  const normalized = { ...medication }

  normalized.id = String(medication.id ?? '')
  normalized.name = String(medication.name ?? '')
  normalized.variation = String(medication.variation ?? '')
  normalized.volumeMl = Number(medication.volumeMl ?? 0)
  normalized.amountMg = Number(medication.amountMg ?? 0)
  normalized.description = String(medication.description ?? '')
  normalized.image = String(medication.image ?? '').trim() || DEFAULT_IMAGE

  normalized.classes = toStringArray(medication.classes ?? medication.indications)
  normalized.reconstituition = toStringArray(
    medication.reconstituition ?? medication.reconstitution
  )
  normalized.diluition = toStringArray(medication.diluition ?? medication.dilution)
  normalized.redilutionIntervals = normalizeRedilutionIntervals(
    medication.redilutionIntervals ?? medication.redilution
  )
  normalized.infusionTime = toStringArray(medication.infusionTime)

  return normalized
}

const normalizeText = (value) =>
  String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const slugify = (value) =>
  normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'medicamento'

const medicationLabel = (medication) =>
  `${medication.name} ${medication.variation}`

const sortMedications = (items) =>
  [...items].sort((a, b) => {
    const labelA = normalizeText(medicationLabel(a))
    const labelB = normalizeText(medicationLabel(b))
    return labelA.localeCompare(labelB, 'pt-BR')
  })

const canManage = computed(() => authRole.value === 'ADMIN')
const isEditingMedication = computed(() => Boolean(editingMedicationId.value))
const redilutionDisplayLines = computed(() => {
  const intervals = selectedMedication.value?.redilutionIntervals ?? []
  const formatted = formatRedilutionIntervals(intervals)

  if (formatted.length > 0) {
    return formatted
  }

  return toStringArray(selectedMedication.value?.diluition ?? [])
})

const filteredMedications = computed(() => {
  const query = normalizeText(searchTerm.value.trim())

  if (!query) {
    return sortMedications(medications.value)
  }

  const filtered = medications.value.filter((medication) => {
    const searchableText = normalizeText(
      [
        medication.name,
        medication.variation,
        medication.description,
        medication.classes.join(' ')
      ].join(' ')
    )

    return searchableText.includes(query)
  })

  return sortMedications(filtered)
})

const adminFilteredMedications = computed(() => {
  const query = normalizeText(adminSearchTerm.value.trim())

  if (!query) {
    return sortMedications(medications.value)
  }

  const filtered = medications.value.filter((medication) => {
    const searchableText = normalizeText(
      [
        medication.name,
        medication.variation,
        medication.description,
        medication.classes.join(' ')
      ].join(' ')
    )

    return searchableText.includes(query)
  })

  return sortMedications(filtered)
})

const roleLabel = computed(() =>
  authRole.value === 'ADMIN' ? 'Administrador' : 'Profissional'
)

const loadRecentSearches = () => {
  const rawHistory = localStorage.getItem(RECENT_KEY)

  if (!rawHistory) {
    recentSearches.value = []
    return
  }

  try {
    const parsed = JSON.parse(rawHistory)
    recentSearches.value = Array.isArray(parsed) ? parsed.slice(0, 8) : []
  } catch {
    recentSearches.value = []
  }
}

const loadMedications = async () => {
  try {
    medicationsLoading.value = true
    medicationsError.value = ''
    const response = await api.getMedications()
    medications.value = Array.isArray(response)
      ? response.map(normalizeMedication).filter(Boolean)
      : []
  } catch (error) {
    medicationsError.value = 'Erro ao carregar medicamentos. Tente recarregar a página.'
    console.error('Erro ao carregar medicamentos:', error)
    medications.value = []
  } finally {
    medicationsLoading.value = false
  }
}

const loadSession = () => {
  const rawAuth = sessionStorage.getItem(AUTH_KEY)

  if (!rawAuth) {
    isAuthenticated.value = false
    authUser.value = ''
    authRole.value = ''
    authToken.value = ''
    return
  }

  try {
    const session = JSON.parse(rawAuth)
    const isRoleValid = session?.role === 'ADMIN' || session?.role === 'USER'

    if (!isRoleValid || !session?.token) {
      sessionStorage.removeItem(AUTH_KEY)
      isAuthenticated.value = false
      authUser.value = ''
      authRole.value = ''
      authToken.value = ''
      return
    }

    isAuthenticated.value = true
    authUser.value = session.username
    authRole.value = session.role
    authToken.value = session.token
    api.setToken(session.token)
  } catch {
    sessionStorage.removeItem(AUTH_KEY)
    isAuthenticated.value = false
    authUser.value = ''
    authRole.value = ''
    authToken.value = ''
  }
}

const saveRecentSearch = (term) => {
  const cleaned = term.trim()

  if (!cleaned) {
    return
  }

  const deduplicated = [
    cleaned,
    ...recentSearches.value.filter(
      (item) => normalizeText(item) !== normalizeText(cleaned)
    )
  ].slice(0, 8)

  recentSearches.value = deduplicated
  localStorage.setItem(RECENT_KEY, JSON.stringify(deduplicated))
}



const clearCalculator = () => {
  prescribedMg.value = ''
  resultMl.value = ''
  redilutionResultMl.value = ''
  redilutionIntervalLabel.value = ''
  calcError.value = ''
}

const resetNewMedication = () => {
  newMedication.name = ''
  newMedication.variation = ''
  newMedication.volumeMl = ''
  newMedication.amountMg = ''
  newMedication.description = ''
  newMedication.classes = ''
  newMedication.reconstituition = ''
  newMedication.redilutionIntervals = [createRedilutionInterval()]
  newMedication.infusionTime = ''
  newMedication.image = ''
  lastAutoVariation.value = ''
  variationAutoEnabled.value = true
  resetImageUpload()
}

const populateMedicationForm = (medication) => {
  newMedication.name = medication.name
  newMedication.variation = medication.variation
  newMedication.volumeMl = String(medication.volumeMl)
  newMedication.amountMg = String(medication.amountMg)
  newMedication.description = medication.description
  newMedication.classes = medication.classes.join(', ')
  newMedication.reconstituition = medication.reconstituition.join('\n')
  newMedication.redilutionIntervals =
    medication.redilutionIntervals?.length > 0
      ? medication.redilutionIntervals.map((interval) => ({
          operator: interval.operator,
          amountMg: String(interval.amountMg),
          volumeMl: String(interval.volumeMl)
        }))
      : [createRedilutionInterval()]
  newMedication.infusionTime = medication.infusionTime.join('\n')
  syncVariationAutoState()

  const rawImage = String(medication.image ?? '').trim()
  const cleanedImage = rawImage === DEFAULT_IMAGE ? '' : rawImage

  if (cleanedImage && isEncodedImageValue(cleanedImage)) {
    uploadedImageDataUrl.value = resolveImageSrc(cleanedImage)
    uploadedImageLabel.value = 'Imagem salva no banco de dados'
    newMedication.image = ''

    if (imageFileInputRef.value) {
      imageFileInputRef.value.value = ''
    }
  } else {
    resetImageUpload()
    newMedication.image = cleanedImage
  }
}

const cancelMedicationEdition = () => {
  editingMedicationId.value = ''
  resetNewMedication()
  adminError.value = ''
  adminSuccess.value = ''
}

const startMedicationEdition = (medication) => {
  editingMedicationId.value = medication.id
  populateMedicationForm(medication)
  adminError.value = ''
  adminSuccess.value = 'Modo de edição ativado para o medicamento selecionado.'
}

const scrollToAdminForm = async () => {
  if (typeof window === 'undefined') {
    return
  }

  const shouldScroll = window.matchMedia?.('(max-width: 1024px)').matches

  if (!shouldScroll) {
    return
  }

  await nextTick()
  adminFormRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const editMedicationFromAdminSearch = (medication) => {
  startMedicationEdition(medication)
  void scrollToAdminForm()
}

const scrollToMedicationDetails = async () => {
  if (typeof window === 'undefined') {
    return
  }

  const shouldScroll = window.matchMedia?.('(max-width: 1024px)').matches

  if (!shouldScroll) {
    return
  }

  await nextTick()
  detailPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const clearSearch = () => {
  searchTerm.value = ''
}

const clearAdminSearch = () => {
  adminSearchTerm.value = ''
}

const selectMedication = (medication) => {
  selectedMedication.value = medication
  searchTerm.value = medicationLabel(medication)
  saveRecentSearch(medicationLabel(medication))
  clearCalculator()
  void scrollToMedicationDetails()
}

const commitAdminSearch = () => {
  const cleaned = adminSearchTerm.value.trim()

  if (!cleaned) {
    return
  }

  if (adminFilteredMedications.value.length > 0) {
    editMedicationFromAdminSearch(adminFilteredMedications.value[0])
  }
}

const handleLogin = async () => {
  const username = loginUser.value.trim().toLowerCase()
  const senha = loginPassword.value

  if (!username || !senha) {
    loginError.value = 'Informe usuário e senha.'
    return
  }

  try {
    loginLoading.value = true
    loginError.value = ''
    
    const response = await api.login(username, senha)

    const role = String(response.role ?? '').toUpperCase()
    
    sessionStorage.setItem(
      AUTH_KEY,
      JSON.stringify({
        username,
        role,
        token: response.token
      })
    )

    authUser.value = username
    authRole.value = role
    authToken.value = response.token
    isAuthenticated.value = true
    activeView.value = 'calculator'
    loginPassword.value = ''
    
    await loadMedications()
  } catch (error) {
    if (error.message == "HTTP 401") {
      loginError.value = 'Falha ao fazer login. Verifique suas credenciais.';
    } else {
      loginError.value = error.message; 
    }
  } finally {
    loginLoading.value = false
  }
}

const handleLogout = () => {
  sessionStorage.removeItem(AUTH_KEY)
  api.setToken(null)
  isAuthenticated.value = false
  authUser.value = ''
  authRole.value = ''
  authToken.value = ''
  selectedMedication.value = null
  searchTerm.value = ''
  activeView.value = 'calculator'
  clearCalculator()
  cancelMedicationEdition()
}

const useRecentSearch = (term) => {
  searchTerm.value = term

  const exactMatch = medications.value.find(
    (medication) => normalizeText(medicationLabel(medication)) === normalizeText(term)
  )

  if (exactMatch) {
    selectMedication(exactMatch)
    return
  }

  if (filteredMedications.value.length > 0) {
    selectMedication(filteredMedications.value[0])
  }
}

const clearRecentSearches = () => {
  recentSearches.value = []
  localStorage.removeItem(RECENT_KEY)
}

const commitSearch = () => {
  const cleaned = searchTerm.value.trim()

  if (!cleaned) {
    return
  }

  if (filteredMedications.value.length > 0) {
    selectMedication(filteredMedications.value[0])
    return
  }

  saveRecentSearch(cleaned)
}

const addRedilutionInterval = () => {
  newMedication.redilutionIntervals.push(createRedilutionInterval())
}

const removeRedilutionInterval = (index) => {
  if (newMedication.redilutionIntervals.length === 1) {
    Object.assign(newMedication.redilutionIntervals[0], createRedilutionInterval())
    return
  }

  newMedication.redilutionIntervals = newMedication.redilutionIntervals.filter(
    (_, i) => i !== index
  )
}

const parseRedilutionIntervals = (intervals) =>
  intervals
    .map((interval) => {
      const operator = interval.operator === 'above' ? 'above' : 'upTo'
      const amountMg = Number(interval.amountMg)
      const volumeMl = Number(interval.volumeMl)

      if (!Number.isFinite(amountMg) || amountMg <= 0) {
        return null
      }

      if (!Number.isFinite(volumeMl) || volumeMl <= 0) {
        return null
      }

      return {
        operator,
        amountMg,
        volumeMl
      }
    })
    .filter(Boolean)

const calculateDose = () => {
  if (!selectedMedication.value) {
    calcError.value = 'Selecione um medicamento antes de calcular.'
    resultMl.value = ''
    redilutionResultMl.value = ''
    redilutionIntervalLabel.value = ''
    return
  }

  const ampouleVolume = Number(selectedMedication.value.volumeMl)
  const ampouleAmount = Number(selectedMedication.value.amountMg)

  if (ampouleVolume <= 0 || ampouleAmount <= 0) {
    calcError.value = 'Dados da ampola inválidos para cálculo.'
    resultMl.value = ''
    redilutionResultMl.value = ''
    redilutionIntervalLabel.value = ''
    return
  }

  const prescribedValue = Number(prescribedMg.value)

  if (prescribedValue <= 0) {
    calcError.value =
      'Informe a quantidade prescrita em mg com valor maior que zero.'
    resultMl.value = ''
    redilutionResultMl.value = ''
    redilutionIntervalLabel.value = ''
    return
  }

  const intervals = selectedMedication.value.redilutionIntervals ?? []

  if (intervals.length === 0) {
    calcError.value = 'Nenhum intervalo de rediluição cadastrado para este medicamento.'
    resultMl.value = ''
    redilutionResultMl.value = ''
    redilutionIntervalLabel.value = ''
    return
  }

  const resolvedInterval = resolveRedilutionInterval(prescribedValue, intervals)

  if (!resolvedInterval) {
    calcError.value =
      'Nenhum intervalo de rediluição compatível com a dose informada.'
    resultMl.value = ''
    redilutionResultMl.value = ''
    redilutionIntervalLabel.value = ''
    return
  }

  const volumeNeeded = (prescribedValue * ampouleVolume) / ampouleAmount
  resultMl.value = `${volumeNeeded.toFixed(2)} mL`

  const diluentNeeded =
    (prescribedValue * resolvedInterval.interval.volumeMl) /
    resolvedInterval.interval.amountMg
  redilutionResultMl.value = `${diluentNeeded.toFixed(2)} mL`
  redilutionIntervalLabel.value = resolvedInterval.label
  calcError.value = ''
}

const addMedication = async () => {
  adminError.value = ''
  adminSuccess.value = ''

  if (imageProcessing.value) {
    adminError.value = 'Aguarde o processamento da imagem antes de salvar.'
    return
  }

  if (!canManage.value) {
    adminError.value = 'Apenas o perfil admin pode cadastrar medicamentos.'
    return
  }

  const name = newMedication.name.trim()
  const variation = newMedication.variation.trim()
  const description = newMedication.description.trim()
  const image = uploadedImageDataUrl.value || newMedication.image.trim() || DEFAULT_IMAGE
  const volumeMl = Number(newMedication.volumeMl)
  const amountMg = Number(newMedication.amountMg)
  const classes = parseListInput(newMedication.classes)
  const reconstituition = parseMultilineInput(newMedication.reconstituition)
  const redilutionIntervals = parseRedilutionIntervals(
    newMedication.redilutionIntervals
  )
  const infusionTime = parseMultilineInput(newMedication.infusionTime)

  if (!name || !variation) {
    adminError.value = 'Informe nome e variação do medicamento.'
    return
  }

  if (!description) {
    adminError.value = 'Informe uma descrição breve do medicamento.'
    return
  }

  if (volumeMl <= 0 || amountMg <= 0) {
    adminError.value = 'Volume e quantidade da ampola devem ser maiores que zero.'
    return
  }

  if (classes.length === 0) {
    adminError.value = 'Informe ao menos uma classe.'
    return
  }

  if (redilutionIntervals.length === 0) {
    adminError.value = 'Informe ao menos um intervalo de rediluição válido.'
    return
  }

  const medicationData = {
    name,
    variation,
    volumeMl,
    amountMg,
    description,
    classes,
    reconstituition,
    redilutionIntervals,
    infusionTime,
    image
  }

  try {
    adminLoading.value = true
    let newEntry

    if (isEditingMedication.value) {
      await api.updateMedication(editingMedicationId.value, medicationData)
      newEntry = normalizeMedication({
        id: editingMedicationId.value,
        ...medicationData
      })
    } else {
      const id = `${slugify(`${name}-${variation}`)}-${Date.now().toString(36)}`
      await api.createMedication({ id, ...medicationData })
      newEntry = normalizeMedication({ id, ...medicationData })
    }

    selectMedication(newEntry)
    resetNewMedication()
    adminSuccess.value = isEditingMedication.value
      ? 'Medicamento atualizado com sucesso.'
      : 'Medicamento cadastrado com sucesso.'
    editingMedicationId.value = ''
    
    await loadMedications()
  } catch (error) {
    adminError.value = error.message || 'Erro ao salvar medicamento. Tente novamente.'
  } finally {
    adminLoading.value = false
  }
}

const removeCustomMedication = async (id) => {
  try {
    adminError.value = ''
    adminSuccess.value = ''
    adminLoading.value = true
    
    await api.deleteMedication(id)

    if (selectedMedication.value?.id === id) {
      selectedMedication.value = null
      searchTerm.value = ''
      clearCalculator()
    }

    if (editingMedicationId.value === id) {
      cancelMedicationEdition()
    }

    adminSuccess.value = 'Medicamento removido com sucesso.'
    await loadMedications()
  } catch (error) {
    adminError.value = error.message || 'Erro ao remover medicamento.'
  } finally {
    adminLoading.value = false
  }
}

watch([prescribedMg], () => {
  resultMl.value = ''
  redilutionResultMl.value = ''
  redilutionIntervalLabel.value = ''
  calcError.value = ''
})

watch(() => newMedication.variation, (value) => {
  if (isSettingVariation.value) {
    return
  }

  const trimmed = String(value ?? '').trim()

  if (!trimmed) {
    variationAutoEnabled.value = true
    return
  }

  variationAutoEnabled.value = trimmed === lastAutoVariation.value
})

watch([() => newMedication.amountMg, () => newMedication.volumeMl], () => {
  const label = buildVariationLabel(newMedication.amountMg, newMedication.volumeMl)
  lastAutoVariation.value = label

  if (!variationAutoEnabled.value) {
    return
  }

  isSettingVariation.value = true
  newMedication.variation = label
  isSettingVariation.value = false
})

watch(authRole, (role) => {
  if (role !== 'ADMIN') {
    activeView.value = 'calculator'
    cancelMedicationEdition()
  }
})

watch([activeView, canManage], async () => {
  await nextTick()
  setupAdminListSync()
})

onMounted(() => {
  isIosDevice.value = detectIosDevice()
  updateStandaloneMode()

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', handleAppInstalled)

  if (window.matchMedia) {
    displayModeQuery = window.matchMedia('(display-mode: standalone)')
    if (displayModeQuery.addEventListener) {
      displayModeQuery.addEventListener('change', updateStandaloneMode)
    } else if (displayModeQuery.addListener) {
      displayModeQuery.addListener(updateStandaloneMode)
    }
  }

  if (window.matchMedia) {
    adminLayoutQuery = window.matchMedia('(min-width: 1025px)')
    if (adminLayoutQuery.addEventListener) {
      adminLayoutQuery.addEventListener('change', handleAdminLayoutChange)
    } else if (adminLayoutQuery.addListener) {
      adminLayoutQuery.addListener(handleAdminLayoutChange)
    }
  }

  setupAdminListSync()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.removeEventListener('appinstalled', handleAppInstalled)

  if (displayModeQuery?.removeEventListener) {
    displayModeQuery.removeEventListener('change', updateStandaloneMode)
  } else if (displayModeQuery?.removeListener) {
    displayModeQuery.removeListener(updateStandaloneMode)
  }

  if (adminLayoutQuery?.removeEventListener) {
    adminLayoutQuery.removeEventListener('change', handleAdminLayoutChange)
  } else if (adminLayoutQuery?.removeListener) {
    adminLayoutQuery.removeListener(handleAdminLayoutChange)
  }

  if (adminFormResizeObserver) {
    adminFormResizeObserver.disconnect()
    adminFormResizeObserver = null
  }
})

loadSession()
loadRecentSearches()
loadMedications()
</script>

<template>
  <main class="app-shell">
    <header class="card hero">
      <div class="hero-title">
        <p class="eyebrow">Hospital Universitário de Santa Maria</p>
        <h1>Calculadora de Dosagem HUSM</h1>
        <!--<p class="hero-text">
          Ferramenta de apoio para regra de três de medicamentos com variações de
          diluição, cálculo padrão e cálculo por peso.
        </p>-->
      </div>
      <div v-if="isAuthenticated" class="hero-controls">
        <div class="header-actions">
          <span class="badge">Logado como {{ authUser }} ({{ roleLabel }})</span>
        </div>

        <div class="header-nav">
          <button
            type="button"
            class="tab-btn"
            :class="{ active: activeView === 'calculator' }"
            aria-label="Calculadora"
            @click="activeView = 'calculator'"
          >
            <span class="tab-icon" aria-hidden="true">🧮</span>
            <span class="tab-text">Calculadora</span>
          </button>

          <button
            v-if="canManage"
            type="button"
            class="tab-btn"
            :class="{ active: activeView === 'admin' }"
            aria-label="Administração"
            @click="activeView = 'admin'"
          >
            <span class="tab-icon" aria-hidden="true">⚙️</span>
            <span class="tab-text">Administração</span>
          </button>

          <button
            type="button"
            class="btn-secondary logout-btn"
            aria-label="Sair"
            @click="handleLogout"
          >
            <span class="tab-icon" aria-hidden="true">➜]</span>
            <span class="tab-text">Sair</span>
          </button>
        </div>
      </div>
    </header>

    <section v-if="!isAuthenticated" class="login-wrapper">
      <article class="card login-card">
        <h2>Acesso do profissional</h2>
        <p class="muted">
          Entre com seu usuário e senha para acessar a ferramenta de dosagem.
        </p>

        <form class="stack-form" @submit.prevent="handleLogin">
          <label class="field-group">
            <span>Usuário</span>
            <input
              v-model="loginUser"
              class="input"
              type="text"
              placeholder="Digite seu usuário"
              autocomplete="username"
            />
          </label>

          <label class="field-group">
            <span>Senha</span>
            <input
              v-model="loginPassword"
              class="input"
              type="password"
              placeholder="Digite sua senha"
              autocomplete="current-password"
            />
          </label>

          <button type="submit" class="btn-primary" :disabled="loginLoading">
            {{ loginLoading ? 'Entrando...' : 'Entrar' }}
          </button>
        </form>

        <p v-if="loginError" class="error-msg">{{ loginError }}</p>
      </article>

      <article v-if="showInstallCard" class="card login-card install-card">
        <div class="install-header">
          <h3>Instalar app</h3>
          <span class="badge">PWA</span>
        </div>
        <p class="muted">
          Tenha acesso rápido pela tela inicial do seu dispositivo.
        </p>

        <div class="install-actions">
          <button
            v-if="canInstallApp"
            type="button"
            class="btn-primary"
            @click="triggerInstall"
          >
            Instalar app
          </button>
          <p v-else class="install-hint">
            Se o botão não aparecer, siga os passos abaixo.
            
          </p>
        </div>

        <div class="install-steps">
          <p>
            <strong>Android (Chrome/Edge):</strong> Menu (três pontos) → Instalar
            app | Adicionar à tela inicial.
          </p>
          <p>
            <strong>iPhone (Safari):</strong> Compartilhar → Adicionar à Tela de Início.
          </p>
          <p>
            <strong>Chrome/Edge (Windows/MacOS):</strong> Menu (três pontos) → Transmitir, salvar e compartilhar → Instalar Calculadora HUSM | Criar atalho.
          </p>
          <p>
            <strong>Safari (MacOS):</strong> Compartilhar → Adicionar ao Dock.
          </p>
        </div>
      </article>
    </section>

    <section v-else class="dashboard-shell">
      <section v-if="activeView === 'calculator' || !canManage" class="dashboard-grid">
        <article class="card search-panel">
          <h2>Pesquisar medicamento</h2>
          <p class="muted">
            Digite nome, apresentação ou classe. Pressione Enter para selecionar o
            primeiro resultado.
          </p>

          <p v-if="medicationsError" class="error-msg">{{ medicationsError }}</p>
          <p v-if="medicationsLoading" class="muted">Carregando medicamentos...</p>

          <div class="search-box">
            <input
              v-model="searchTerm"
              class="input search-input"
              type="text"
              placeholder="Ex.: dipirona, morfina, ceftriaxona"
              @keyup.enter="commitSearch"
            />
            <button
              v-if="searchTerm"
              type="button"
              class="clear-btn"
              aria-label="Limpar busca"
              @click="clearSearch"
            >
              ×
            </button>
          </div>

          <ul v-if="filteredMedications.length > 0" class="result-list">
            <li v-for="medication in filteredMedications" :key="medication.id">
              <button
                type="button"
                class="result-btn"
                @click="selectMedication(medication)"
              >
                <strong>{{ medication.name }}</strong>
                <small>{{ medication.variation }}</small>
              </button>
            </li>
          </ul>
          <p v-else class="empty-text">Nenhum medicamento encontrado.</p>

          <div class="recent-wrap">
            <div class="recent-head">
              <h3>Pesquisas recentes</h3>
              <button
                type="button"
                class="text-btn"
                :disabled="recentSearches.length === 0"
                @click="clearRecentSearches"
              >
                Limpar
              </button>
            </div>

            <div class="chips">
              <button
                v-for="item in recentSearches"
                :key="item"
                type="button"
                class="chip"
                @click="useRecentSearch(item)"
              >
                {{ item }}
              </button>
              <p v-if="recentSearches.length === 0" class="empty-inline">
                Sem histórico de pesquisas.
              </p>
            </div>
          </div>
        </article>

        <article ref="detailPanelRef" class="card detail-panel">
          <div v-if="selectedMedication" class="detail-layout">
            <div class="detail-info">
              <div class="med-head">
                <img
                  class="ampoule-image"
                  :src="resolveImageSrc(selectedMedication.image)"
                  :alt="`Ampola de ${selectedMedication.name}`"
                />
                <div>
                  <h2>{{ selectedMedication.name }}</h2>
                  <p class="med-variation">{{ selectedMedication.variation }}</p>
                </div>
              </div>

              <p class="med-description">{{ selectedMedication.description }}</p>

              <p class="subtitle">Classe</p>
              <ul class="indication-list" v-if="selectedMedication.classes.length > 0">
                <li v-for="item in selectedMedication.classes" :key="item">
                  {{ item }}
                </li>
              </ul>
              <p v-else class="empty-text">Não informado.</p>

              <p class="subtitle">Reconstituição</p>
              <ul
                class="indication-list"
                v-if="selectedMedication.reconstituition.length > 0"
              >
                <li
                  v-for="item in selectedMedication.reconstituition"
                  :key="item"
                >
                  {{ item }}
                </li>
              </ul>
              <p v-else class="empty-text">Não informado.</p>

              <p class="subtitle">Rediluição</p>
              <ul class="indication-list" v-if="redilutionDisplayLines.length > 0">
                <li v-for="item in redilutionDisplayLines" :key="item">
                  {{ item }}
                </li>
              </ul>
              <p v-else class="empty-text">Não informado.</p>

              <p class="subtitle">Tempo de infusão</p>
              <ul
                class="indication-list"
                v-if="selectedMedication.infusionTime.length > 0"
              >
                <li v-for="item in selectedMedication.infusionTime" :key="item">
                  {{ item }}
                </li>
              </ul>
              <p v-else class="empty-text">Não informado.</p>
            </div>

            <div class="detail-calc">
              <section class="calc-card">
              <div class="calc-head">
                <h3>Calculadora</h3>
              </div>

              <div class="form-grid">
                <label class="field-group">
                  <span>Volume da ampola (mL)</span>
                  <input class="input" :value="selectedMedication.volumeMl" readonly />
                </label>

                <label class="field-group">
                  <span>Quantidade na ampola (mg)</span>
                  <input class="input" :value="selectedMedication.amountMg" readonly />
                </label>

                <label class="field-group">
                  <span>Quantidade prescrita (mg)</span>
                  <input
                    v-model="prescribedMg"
                    class="input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Ex.: 250"
                  />
                </label>

                <button type="button" class="btn-primary full" style="margin-top: 1rem; grid-column: 1 / -1;" @click="calculateDose">
                  Calcular
                </button>

                <label class="field-group full-row">
                  <span>Volume necessário (mL)</span>
                  <input
                    class="input result"
                    :value="resultMl"
                    readonly
                    placeholder="Resultado do cálculo"
                  />
                </label>

                <label class="field-group full-row">
                  <span>Rediluir em (mL)</span>
                  <input
                    class="input result"
                    :value="redilutionResultMl"
                    readonly
                    placeholder="Resultado da rediluição"
                  />
                </label>

                <p v-if="redilutionIntervalLabel" class="hint full-row">
                  Intervalo aplicado: {{ redilutionIntervalLabel }}
                </p>
              </div>

              <p v-if="calcError" class="error-msg">{{ calcError }}</p>
              </section>
            </div>
          </div>

          <div v-else class="placeholder">
            <h2>Selecione um medicamento</h2>
            <p>
              Ao escolher um item na busca, você verá a descrição, classe, reconstituição,
              rediluição, tempo de infusão e a calculadora com os campos preenchidos.
            </p>
          </div>
        </article>
      </section>

      <section v-if="canManage && activeView === 'admin'" class="admin-layout">
        <article ref="adminFormRef" class="card admin-form-card">
          <h2>Cadastro de medicamentos</h2>
          <!--<p class="muted">
            Área administrativa para adicionar novos medicamentos à base local da aplicação.
          </p>-->

          <form class="admin-form" @submit.prevent="addMedication">
            <label class="field-group">
              <span>Nome do medicamento</span>
              <input
                v-model="newMedication.name"
                class="input"
                type="text"
                placeholder="Ex.: Midazolam"
              />
            </label>

            <label class="field-group">
              <span>Variação (diluição)</span>
              <input
                v-model="newMedication.variation"
                class="input"
                type="text"
                placeholder="Ex.: 5 mg / 1 mL"
              />
            </label>

            <label class="field-group">
              <span>Volume da ampola (mL)</span>
              <input
                v-model="newMedication.volumeMl"
                class="input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex.: 2"
              />
            </label>

            <label class="field-group">
              <span>Quantidade na ampola (mg)</span>
              <input
                v-model="newMedication.amountMg"
                class="input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex.: 100"
              />
            </label>

            <label class="field-group">
              <span>Descrição breve</span>
              <textarea
                v-model="newMedication.description"
                class="input textarea"
                placeholder="Descrição clínica resumida do medicamento"
              ></textarea>
            </label>

            <label class="field-group">
              <span>Classe (separar por vírgula para mais de um item)</span>
              <input
                v-model="newMedication.classes"
                class="input"
                type="text"
                placeholder="Ex.: Antiviral, Penicilina, ..."
              />
            </label>

            <label class="field-group">
              <span>Reconstituição (1 item por linha)</span>
              <textarea
                v-model="newMedication.reconstituition"
                class="input textarea"
                placeholder="Ex.: 1.000.000 UI: 2 mL"
              ></textarea>
            </label>

            <label class="field-group">
              <span>Rediluição (intervalos)</span>
              <div class="redilution-intervals">
                <button
                  type="button"
                  class="btn-secondary compact"
                  @click="addRedilutionInterval"
                >
                  Adicionar intervalo
                </button>
                <div
                  v-for="(interval, index) in newMedication.redilutionIntervals"
                  :key="`interval-${index}`"
                  class="redilution-row"
                >
                  <select v-model="interval.operator" class="input">
                    <option value="upTo">até</option>
                    <option value="above">acima de</option>
                  </select>
                  <div class="input-unit-wrap">
                    <input
                      v-model="interval.amountMg"
                      class="input input-unit"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                    />
                    <span class="input-unit-label">mg</span>
                  </div>
                  <div class="input-unit-wrap">
                    <input
                      v-model="interval.volumeMl"
                      class="input input-unit"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                    />
                    <span class="input-unit-label">mL</span>
                  </div>
                  <button
                    type="button"
                    class="btn-danger compact"
                    @click="removeRedilutionInterval(index)"
                  >
                    Remover
                  </button>
                </div>
                
              </div>
            </label>

            <label class="field-group">
              <span>Tempo de infusão (1 item por linha)</span>
              <textarea
                v-model="newMedication.infusionTime"
                class="input textarea"
                placeholder="Ex.: Crianças: 60 min"
              ></textarea>
            </label>

            <label class="field-group">
              <span>Imagem (arquivo, opcional)</span>
              <input
                ref="imageFileInputRef"
                class="input"
                type="file"
                accept="image/*"
                @change="handleImageFileSelected"
              />
            </label>

            <div v-if="uploadedImageDataUrl" class="image-preview-row">
              <img
                class="ampoule-image"
                :src="uploadedImageDataUrl"
                alt="Imagem do medicamento"
              />
              <div class="image-preview-actions">
                <p class="image-preview-text">
                  {{ uploadedImageLabel || 'Imagem selecionada.' }}
                </p>
                <button
                  type="button"
                  class="btn-danger compact"
                  :disabled="adminLoading || imageProcessing"
                  @click="removeUploadedImage"
                >
                  Remover foto
                </button>
              </div>
            </div>

            <label v-if="!uploadedImageDataUrl" class="field-group">
              <span>URL da imagem (opcional)</span>
              <input
                v-model="newMedication.image"
                class="input"
                type="text"
                placeholder="https://..."
              />
            </label>

            <div class="admin-actions">
              <button
                type="submit"
                class="btn-primary"
                :disabled="adminLoading || imageProcessing"
              >
                {{ adminLoading ? 'Salvando...' : isEditingMedication ? 'Salvar alterações' : 'Adicionar medicamento' }}
              </button>
              <button
                v-if="isEditingMedication"
                type="button"
                class="btn-secondary"
                :disabled="adminLoading || imageProcessing"
                @click="cancelMedicationEdition"
              >
                Cancelar edição
              </button>
            </div>
          </form>

          <p v-if="adminError" class="error-msg">{{ adminError }}</p>
          <p v-if="adminSuccess" class="success-msg">{{ adminSuccess }}</p>
        </article>

        <article ref="adminListRef" class="card admin-list-card">
          <h2>Medicamentos adicionados</h2>
          <p class="muted">Total de cadastros: {{ medications.length }}</p>

          <p class="muted">
            Pesquise por nome, apresentação ou classe. Pressione Enter para editar o
            primeiro resultado.
          </p>

          <div class="search-box">
            <input
              v-model="adminSearchTerm"
              class="input search-input"
              type="text"
              placeholder="Ex.: dipirona, ceftriaxona, antifúngico"
              @keyup.enter="commitAdminSearch"
            />
            <button
              v-if="adminSearchTerm"
              type="button"
              class="clear-btn"
              aria-label="Limpar busca"
              @click="clearAdminSearch"
            >
              ×
            </button>
          </div>

          <ul v-if="adminFilteredMedications.length > 0" class="admin-med-list">
            <li
              v-for="medication in adminFilteredMedications"
              :key="medication.id"
              class="admin-med-item"
              :class="{ editing: editingMedicationId === medication.id }"
            >
              <div>
                <strong>{{ medication.name }}</strong>
                <p class="admin-meta">{{ medication.variation }}</p>
                <p class="admin-meta">
                  {{ medication.amountMg }} mg em {{ medication.volumeMl }} mL
                </p>
                <p v-if="editingMedicationId === medication.id" class="editing-tag">
                  Em edição
                </p>
              </div>

              <div class="admin-item-actions">
                <button
                  type="button"
                  class="btn-secondary compact"
                  :disabled="adminLoading"
                  @click="editMedicationFromAdminSearch(medication)"
                >
                  Editar
                </button>
                <button
                  type="button"
                  class="btn-danger compact"
                  :disabled="adminLoading"
                  @click="removeCustomMedication(medication.id)"
                >
                  Remover
                </button>
              </div>
            </li>
          </ul>
          <p v-else class="empty-text">
            {{ adminSearchTerm ? 'Nenhum medicamento encontrado.' : 'Nenhum medicamento cadastrado.' }}
          </p>
        </article>
      </section>
    </section>
  </main>
</template>