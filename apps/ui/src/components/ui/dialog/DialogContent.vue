<script setup>
import { reactiveOmit } from "@vueuse/core";
import { computed } from "vue";
import { X } from "lucide-vue-next";
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  useForwardPropsEmits,
} from "reka-ui";
import { cn } from "@/lib/utils";
import DialogOverlay from "./DialogOverlay.vue";

defineOptions({
  inheritAttrs: false,
});

const props = defineProps({
  forceMount: { type: Boolean, required: false },
  disableOutsidePointerEvents: { type: Boolean, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  class: { type: null, required: false },
  showCloseButton: { type: Boolean, required: false, default: true },
  size: { type: String, required: false, default: 'default' }, // 'sm' | 'default' | 'lg' | 'xl' | 'full'
});
const emits = defineEmits([
  "escapeKeyDown",
  "pointerDownOutside",
  "focusOutside",
  "interactOutside",
  "openAutoFocus",
  "closeAutoFocus",
]);

const delegatedProps = reactiveOmit(props, "class", "size");

const forwarded = useForwardPropsEmits(delegatedProps, emits);

// Responsive size presets that scale with viewport
const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'w-[90vw] sm:w-[80vw] sm:max-w-md md:max-w-lg';
    case 'lg':
      return 'w-[95vw] sm:w-[90vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl';
    case 'xl':
      return 'w-[95vw] sm:w-[92vw] sm:max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl';
    case 'full':
      return 'w-[95vw] max-w-[95vw] h-[90vh]';
    default: // 'default'
      return 'w-[90vw] sm:w-[85vw] sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl';
  }
});
</script>

<template>
  <DialogPortal>
    <DialogOverlay />
    <DialogContent
      data-slot="dialog-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="
        cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200',
          sizeClasses,
          props.class,
        )
      "
    >
      <slot />

      <DialogClose
        v-if="showCloseButton"
        data-slot="dialog-close"
        class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 p-1 cursor-pointer hover:bg-muted focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
      >
        <X />
        <span class="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
