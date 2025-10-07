// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { redirect } from 'next/navigation'

export default function FacultySettingsRedirectPage() {
  redirect('/workspace/settings?persona=faculty')
}
