import { Link, type Href } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import React from 'react'
import { Platform } from 'react-native'

type ExternalLinkProps =
  Omit<React.ComponentProps<typeof Link>, 'href'> & {
    href: string
  }

export function ExternalLink({ href, onPress, ...props }: ExternalLinkProps) {
  return (
    <Link
      target="_blank"
      {...props}
      href={href as Href}
      onPress={(e) => {
        onPress?.(e)

        if (Platform.OS !== 'web') {
          e.preventDefault()
          WebBrowser.openBrowserAsync(href)
        }
      }}
    />
  )
}