import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from '../App.vue'

// Mock vue-router
vi.mock('vue-router', () => ({
  useRoute: () => ({
    path: '/',
    meta: {}
  }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn()
  })
}))

// Mock components that might be problematic or not needed for a shallow mount
vi.mock('@/components/Navbar.vue', () => ({ default: { template: '<div>Navbar</div>' } }))
vi.mock('@/components/DesktopNavbar.vue', () => ({ default: { template: '<div>DesktopNavbar</div>' } }))
vi.mock('@/views/ErrorPage.vue', () => ({ default: { template: '<div>ErrorPage</div>' } }))
vi.mock('@/components/ui/sonner', () => ({ Toaster: { template: '<div>Toaster</div>' } }))
vi.mock('@/components/AILoadingIsland.vue', () => ({ default: { template: '<div>AILoadingIsland</div>' } }))
vi.mock('@/components/Support/PiscesDialog.vue', () => ({ default: { template: '<div>PiscesDialog</div>' } }))

describe('App', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('mounts without crashing', () => {
    // We use shallowMount or stubs to avoid deep rendering issues in this basic test
    const wrapper = mount(App, {
      global: {
        stubs: {
          'router-view': true,
          'router-link': true
        }
      }
    })

    // Check if the main elements exist
    expect(wrapper.exists()).toBe(true)
  })
})
