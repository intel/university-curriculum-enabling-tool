// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { redirect } from 'next/navigation'

export default function StudentSettingsRedirectPage() {
  redirect('/workspace/settings?persona=student')
}
