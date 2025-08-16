'use client'

import React from 'react'

import { ContextSwitcher } from '@/components/context-switcher'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar'
import { AppUser } from '@/components/app-user'
import { SourcesList } from './sources-list'

// This is sample data.
const data = {
  user: {
    email: 'anonymous@academic.edu',
  },
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <ContextSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <SourcesList />
      </SidebarContent>
      <SidebarFooter>
        <AppUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
