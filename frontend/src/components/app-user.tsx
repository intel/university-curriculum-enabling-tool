'use client'

import { ChevronsUpDown, LogOut } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import AppSettings from './app-settings'
import { Persona, usePersonaStore } from '@/lib/store/persona-store'
import { AppPersona } from './app-persona'
import { getPersonaIconComponent } from '@/components/persona-icons'
import { FirstTimeSetup } from './first-time-setup'
import { useRouter } from 'next/navigation'

export function AppUser({
  user,
}: {
  user: {
    email: string
  }
}) {
  const router = useRouter()
  const { isMobile } = useSidebar()

  const { personas, activePersona, setActivePersona } = usePersonaStore()

  const currentPersona: Persona = personas.find((p) => p.id === activePersona)!

  const handleExit = () => {
    // Reset active persona and redirect to first-time setup
    setActivePersona('')
    router.push('/')
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-sidebar-border">
                {currentPersona && <>{getPersonaIconComponent(activePersona, 'md')}</>}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium capitalize">{currentPersona?.id}</span>
                <span className="truncate text-xs">{currentPersona?.name}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-80 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <AppPersona user={user} />
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup></DropdownMenuGroup>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              <AppSettings />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleExit}>
              <div className="flex w-full cursor-pointer items-center gap-2 p-1">
                <LogOut className="h-4 w-4" />
                <p>Exit</p>
              </div>
              {/* <LogOut className="mr-2 h-4 w-4" />
              <span>Exit</span> */}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <FirstTimeSetup />
    </SidebarMenu>
  )
}
