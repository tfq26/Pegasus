/**
 * useLocalFile — Open local files using the browser file picker
 */
import { ref } from 'vue'

export function useLocalFile() {
  const processing = ref(false)

  const openLocalFile = async (): Promise<File | null> => {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.csv,.tsv,.json,.xlsx,.xls,.parquet'
      input.onchange = () => {
        const file = input.files?.[0] ?? null
        resolve(file)
      }
      input.click()
    })
  }

  return { openLocalFile, processing }
}
