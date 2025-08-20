// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

export function getSelectedModel(): string {
  if (typeof window !== 'undefined') {
    const storedModel = localStorage.getItem('selectedModel')
    return storedModel || 'gemma:2b'
  } else {
    // Default model
    return 'gemma:2b'
  }
}
