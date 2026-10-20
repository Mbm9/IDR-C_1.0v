import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { Providers } from './providers'
import { plexSans, plexMono, plexArabic } from '@/lib/fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'Identity Radar',
  description: 'AI-powered Identity and Access Management posture management',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()
  const dir = locale === 'ar' ? 'rtl' : 'ltr'

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('theme');
                if (theme === 'dark') document.documentElement.classList.add('dark');
                const locale = document.cookie.match(/locale=(en|ar)/);
                if (locale && locale[1] === 'ar') {
                  document.documentElement.dir = 'rtl';
                  document.documentElement.lang = 'ar';
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className={`${plexSans.variable} ${plexMono.variable} ${plexArabic.variable} font-[var(--font-sans)] antialiased`}>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
