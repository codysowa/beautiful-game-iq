import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPosition,
  BannerAdSize,
} from '@capacitor-community/admob'
import { Purchases } from '@revenuecat/purchases-capacitor'

const PREMIUM_ENTITLEMENT = 'premium_no_ads'

const revenueCatIosKey = import.meta.env.VITE_REVENUECAT_IOS_API_KEY || ''
const admobIosBannerId = import.meta.env.VITE_ADMOB_IOS_BANNER_ID || ''

type Props = {
  userId: string
}

export default function Monetization({ userId }: Props) {
  const [ready, setReady] = useState(false)
  const [premium, setPremium] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [packages, setPackages] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const isNativeIos = Capacitor.getPlatform() === 'ios'

  async function refreshCustomerInfo() {
    if (!isNativeIos || !revenueCatIosKey) return false

    const customerInfo = await Purchases.getCustomerInfo()
    const active = Boolean(customerInfo.entitlements.active[PREMIUM_ENTITLEMENT])
    setPremium(active)
    return active
  }

  async function setupAds() {
    if (!isNativeIos || !admobIosBannerId) return

    await AdMob.initialize()

    let consentInfo = await AdMob.requestConsentInfo()

    if (
      consentInfo.isConsentFormAvailable &&
      consentInfo.status === AdmobConsentStatus.REQUIRED
    ) {
      consentInfo = await AdMob.showConsentForm()
    }

    if (!consentInfo.canRequestAds) return

    if (!consentInfo.isConsentFormAvailable) {
      const tracking = await AdMob.trackingAuthorizationStatus()
      if (tracking.status === 'notDetermined') {
        await AdMob.requestTrackingAuthorization()
      }
    }

    await AdMob.showBanner({
      adId: admobIosBannerId,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
    })
  }

  async function hideAds() {
    if (!isNativeIos) return
    try {
      await AdMob.removeBanner()
    } catch {
      // Banner may not have been created yet.
    }
  }

  async function initialize() {
    if (!isNativeIos) {
      setReady(true)
      return
    }

    try {
      let activePremium = false

      if (revenueCatIosKey) {
        await Purchases.configure({
          apiKey: revenueCatIosKey,
          appUserID: userId || undefined,
        })
        activePremium = await refreshCustomerInfo()

        const offerings = await Purchases.getOfferings()
        setPackages(offerings.current?.availablePackages || [])
      }

      setReady(true)

      if (!activePremium) {
        await setupAds()
      }
    } catch (error) {
      console.error('Monetization initialization failed:', error)
      setReady(true)
    }
  }

  useEffect(() => {
    void initialize()

    return () => {
      if (isNativeIos) {
        void hideAds()
      }
    }
  }, [userId])

  useEffect(() => {
    if (!isNativeIos || !ready) return

    if (premium) {
      void hideAds()
    } else {
      void setupAds().catch((error) => console.error('Could not show ads:', error))
    }
  }, [premium, ready])

  async function buyPremium(pkg: any) {
    if (!revenueCatIosKey || !pkg) return

    setBusy(true)
    setMessage('Opening Apple subscription checkout…')

    try {
      const result = await Purchases.purchasePackage({ aPackage: pkg })
      const active = Boolean(result.customerInfo.entitlements.active[PREMIUM_ENTITLEMENT])

      setPremium(active)

      if (active) {
        setMessage('Premium is active. Ads are now removed.')
        setModalOpen(false)
      } else {
        setMessage('Purchase completed, but Premium is not active yet.')
      }
    } catch (error: any) {
      if (!String(error?.message || error).toLowerCase().includes('cancel')) {
        console.error('Premium purchase failed:', error)
        setMessage('The purchase could not be completed. Please try again.')
      } else {
        setMessage('')
      }
    } finally {
      setBusy(false)
    }
  }

  async function restorePremium() {
    if (!revenueCatIosKey) return

    setBusy(true)
    setMessage('Restoring your Apple purchases…')

    try {
      const result = await Purchases.restorePurchases()
      const active = Boolean(result.customerInfo.entitlements.active[PREMIUM_ENTITLEMENT])

      setPremium(active)
      setMessage(
        active
          ? 'Premium restored. Ads are removed.'
          : 'No active Premium purchase was found for this Apple account.'
      )
    } catch (error) {
      console.error('Premium restore failed:', error)
      setMessage('Could not restore purchases. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!isNativeIos || !ready) return null

  return (
    <>
      {!premium && revenueCatIosKey && (
        <button
          type="button"
          className="premium-launch-button"
          onClick={() => {
            setMessage('')
            setModalOpen(true)
          }}
        >
          Premium — No Ads
        </button>
      )}

      {premium && (
        <div className="premium-active-badge" aria-label="Premium active">
          Premium • No Ads
        </div>
      )}

      {modalOpen && (
        <div className="premium-modal-backdrop">
          <section className="premium-modal" role="dialog" aria-modal="true" aria-labelledby="premium-title">
            <button
              type="button"
              className="premium-close"
              onClick={() => setModalOpen(false)}
              aria-label="Close"
            >
              ×
            </button>

            <p className="eyebrow">BEAUTIFUL GAME IQ</p>
            <h2 id="premium-title">Premium — No Ads</h2>
            <p>
              Keep every Beautiful Game IQ feature and remove advertising from the app.
            </p>

            {packages.length > 0 ? (
              <div className="premium-package-list">
                {packages.map((pkg) => (
                  <button
                    key={pkg.identifier}
                    type="button"
                    className="premium-package"
                    disabled={busy}
                    onClick={() => void buyPremium(pkg)}
                  >
                    <strong>{pkg.product?.title || 'Premium'}</strong>
                    <span>{pkg.product?.priceString || 'Subscribe'}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="premium-not-configured">
                Premium products will appear here once the Apple subscription is configured.
              </div>
            )}

            <div className="premium-modal-actions">
              <button
                type="button"
                className="secondary-button premium-restore"
                disabled={busy || !revenueCatIosKey}
                onClick={() => void restorePremium()}
              >
                Restore Purchases
              </button>

              <button
                type="button"
                className="secondary-button premium-restore"
                onClick={() => void AdMob.showPrivacyOptionsForm()}
              >
                Privacy Choices
              </button>
            </div>

            {message && <p className="premium-message">{message}</p>}

            <p className="premium-footnote">
              Subscription pricing and billing are handled by Apple.
            </p>
          </section>
        </div>
      )}
    </>
  )
}
