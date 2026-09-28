<script setup lang="ts" vapor>
const { options, size = 'md' } = defineProps<{ options: [string, string][]; size?: 'sm' | 'md' }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="flex flex-none gap-0.5 rounded-lg bg-accent p-0.5" role="radiogroup">
    <button
      v-for="[value, label] in options"
      :key="value"
      type="button"
      role="radio"
      :aria-checked="model === value"
      class="grid place-items-center rounded-md px-3 text-[12.5px]"
      :class="[
        size === 'sm' ? 'h-[26px]' : 'h-7',
        model === value
          ? 'bg-bg text-fg shadow-[0_1px_2px_rgb(0_0_0/0.15),0_0_0_1px_var(--border)]'
          : 'text-mfg hover:text-fg',
      ]"
      @click="model = value"
    >
      {{ label }}
    </button>
  </div>
</template>
