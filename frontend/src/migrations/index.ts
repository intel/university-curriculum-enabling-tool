// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import * as migration_20250610_002750 from './20250610_002750'

export const migrations = [
  {
    up: migration_20250610_002750.up,
    down: migration_20250610_002750.down,
    name: '20250610_002750',
  },
]
