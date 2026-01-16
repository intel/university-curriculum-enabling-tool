// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import * as migration_20250610_202500 from './20250610_202500'
import * as migration_20251209_083000 from './20251209_083000'

export const migrations = [
  {
    up: migration_20250610_202500.up,
    down: migration_20250610_202500.down,
    name: '20250610_202500',
  },
  {
    up: migration_20251209_083000.up,
    down: migration_20251209_083000.down,
    name: '20251209_083000',
  },
]
