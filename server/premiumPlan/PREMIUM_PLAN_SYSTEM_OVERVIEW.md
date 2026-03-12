# Premium Plan System Overview

## System Architecture

The premium plan system supports multiple payment gateways and provides a unified interface for subscription management across different platforms.

### Supported Payment Gateways

1. **Google Play Store** ✅ (Fully Implemented)
2. **Apple Store** ✅ (Fully Implemented)
3. **Stripe** ✅ (Fully Implemented)
4. **RazorPay** ⚠️ (Partially Implemented)

## Database Models

### 1. PremiumPlan Model
```javascript
{
  name: String,
  validity: Number,
  validityType: String, // "month" or "year"
  price: Number,
  tag: String,
  productKey: String, // Maps to store product IDs
  planBenefit: Array,
  isAutoRenew: Boolean
}
```

### 2. PremiumPlanHistory Model
```javascript
{
  userId: ObjectId,
  premiumPlanId: ObjectId,
  paymentGateway: String, // "GooglePlay", "AppleStore", "Stripe", "RazorPay"
  amount: Number,
  currency: String,
  status: String, // 'success', 'failed', 'pending', 'active', 'canceled', etc.
  transactionId: String,
  date: Date,
  cancelledAt: Date,
  
  // Google Play specific fields
  googlePlayPurchaseToken: String,
  googlePlayOrderId: String,
  googlePlayPackageName: String,
  googlePlayProductId: String,
  googlePlayPurchaseTime: Date,
  googlePlayExpiryTime: Date,
  googlePlayAutoRenewing: Boolean,
  
  // Apple Store specific fields
  appleStoreOriginalTransactionId: String,
  appleStoreTransactionId: String,
  appleStoreBundleId: String,
  appleStoreProductId: String,
  appleStorePurchaseDate: Date,
  appleStoreExpiresDate: Date,
  appleStoreAutoRenewStatus: Boolean,
  appleStoreInTrialPeriod: Boolean,
  appleStoreInGracePeriod: Boolean,
  
  // Stripe specific fields
  stripeSubscriptionId: String,
  stripeCustomerId: String,
  stripeInvoiceId: String,
  
  // RazorPay specific fields
  razorpayPaymentId: String,
  razorpayOrderId: String
}
```

## API Endpoints

### Core Endpoints

1. **Create Premium Plan** (Admin)
   - `POST /premiumPlan/create`
   - Creates new subscription plans

2. **Update Premium Plan** (Admin)
   - `PATCH /premiumPlan/update`
   - Updates existing plans

3. **Delete Premium Plan** (Admin)
   - `DELETE /premiumPlan/delete`
   - Removes plans

4. **Get Premium Plans** (Public)
   - `GET /premiumPlan/`
   - Lists all available plans

5. **Create Subscription History** (User)
   - `POST /premiumPlan/createHistory`
   - Processes subscription purchases

6. **Get User Plan History** (User)
   - `GET /premiumPlan/planHistoryOfUser`
   - Shows user's subscription history

7. **Get All Plan History** (Admin)
   - `GET /premiumPlan/history`
   - Admin view of all subscriptions

### Google Play Store Endpoints

1. **Verify Google Play Purchase**
   - `POST /premiumPlan/verifyGooglePlayPurchase`
   - Verifies purchase tokens with Google Play

2. **Check Google Play Subscription**
   - `POST /premiumPlan/checkGooglePlaySubscription`
   - Checks subscription status

3. **Google Play Webhook**
   - `POST /premiumPlan/googlePlayWebhook`
   - Receives server-side notifications

### Apple Store Endpoints

1. **Verify Apple Store Purchase**
   - `POST /premiumPlan/verifyAppleStorePurchase`
   - Verifies transactions with Apple Store

2. **Check Apple Store Subscription**
   - `POST /premiumPlan/checkAppleStoreSubscription`
   - Checks subscription status

3. **Apple Store Webhook**
   - `POST /premiumPlan/appleStoreWebhook`
   - Receives server-side notifications

## Payment Gateway Integration

### Google Play Store Integration

**Setup Requirements:**
- Google Play Developer account
- Service account with API access
- Private key file
- App configured in Google Play Console

**Configuration:**
```env
GOOGLE_PLAY_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PLAY_KEY=your-private-key-content
```

**Client Implementation (Android):**
```kotlin
// Initialize billing client
val billingClient = BillingClient.newBuilder(context)
    .setListener { billingResult, purchases ->
        // Handle purchase updates
    }
    .enablePendingPurchases()
    .build()

// Launch billing flow
val billingFlowParams = BillingFlowParams.newBuilder()
    .setSkuDetails(skuDetails)
    .build()
billingClient.launchBillingFlow(activity, billingFlowParams)
```

### Apple Store Integration

**Setup Requirements:**
- Apple Developer account
- App Store Connect API key
- Private key file (.p8)
- App configured in App Store Connect

**Configuration:**
```env
APPLE_STORE_KEY_ID=your-key-id
APPLE_STORE_ISSUER_ID=your-issuer-id
APPLE_STORE_PRIVATE_KEY=your-private-key-content
APPLE_STORE_BUNDLE_ID=com.yourapp.bundle
```

**Client Implementation (iOS):**
```swift
import StoreKit

class SubscriptionManager: NSObject, SKPaymentTransactionObserver {
    // Initialize StoreKit
    override init() {
        super.init()
        SKPaymentQueue.default().add(self)
    }
    
    // Purchase subscription
    func purchaseSubscription(product: SKProduct) {
        let payment = SKPayment(product: product)
        SKPaymentQueue.default().add(payment)
    }
}
```

### Stripe Integration

**Setup Requirements:**
- Stripe account
- API keys
- Webhook configuration

**Configuration:**
```env
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_SUBSCRIPTION_WEBHOOK_SECRET=whsec_...
```

## Webhook Handling

### Google Play Webhook
- Receives notifications about subscription changes
- Updates subscription status automatically
- Handles renewal, cancellation, and other events

### Apple Store Webhook
- Receives signed payloads with subscription updates
- Verifies payload authenticity
- Updates subscription status automatically

### Stripe Webhook
- Handles payment success/failure events
- Updates subscription status
- Manages customer data

## Security Features

1. **Server-Side Verification**
   - All purchases verified with respective stores
   - Prevents fake purchases
   - Ensures data integrity

2. **Duplicate Prevention**
   - Checks for existing transactions
   - Prevents double processing
   - Maintains data consistency

3. **Webhook Security**
   - Verifies request origins
   - Implements rate limiting
   - Logs all events for debugging

## User Experience Flow

### 1. Plan Selection
- User views available plans
- Compares features and pricing
- Selects desired plan

### 2. Payment Processing
- User initiates purchase
- Payment processed through selected gateway
- Server verifies purchase with store
- Subscription activated upon verification

### 3. Subscription Management
- Users can view subscription status
- Auto-renewal handled by stores
- Cancellation through store interfaces
- Status updates via webhooks

### 4. Notifications
- Purchase confirmations
- Subscription status updates
- Renewal reminders
- Cancellation notifications

## Monitoring and Analytics

### Key Metrics
- Successful purchases vs failures
- Subscription renewal rates
- Cancellation rates
- Revenue tracking
- Platform distribution

### Logging
- All purchase attempts
- Verification results
- Webhook events
- Error tracking
- Performance monitoring

## Best Practices

1. **Always verify purchases server-side**
2. **Handle all subscription states**
3. **Implement proper error handling**
4. **Log all transactions for debugging**
5. **Test thoroughly with sandbox accounts**
6. **Monitor webhook delivery**
7. **Implement retry logic for failed verifications**
8. **Keep API credentials secure**
9. **Regular security audits**
10. **Backup subscription data**

## Testing Strategy

### Sandbox Testing
- Use test accounts for all platforms
- Test all subscription states
- Verify webhook handling
- Test error scenarios

### Production Monitoring
- Monitor webhook delivery
- Track verification success rates
- Alert on high failure rates
- Regular health checks

## Troubleshooting

### Common Issues
1. **Invalid purchase tokens/transaction IDs**
2. **Webhook delivery failures**
3. **API quota exceeded**
4. **Credential configuration errors**
5. **Network connectivity issues**

### Debug Steps
1. Check API credentials
2. Verify webhook URLs
3. Monitor server logs
4. Test with sandbox accounts
5. Review error messages

## Future Enhancements

1. **Additional Payment Gateways**
   - PayPal
   - Amazon Pay
   - Regional payment methods

2. **Advanced Features**
   - Promotional codes
   - Family sharing
   - Enterprise subscriptions
   - Usage-based billing

3. **Analytics Improvements**
   - Real-time dashboards
   - Advanced reporting
   - Predictive analytics
   - A/B testing support

## Support Resources

- [Google Play Billing Documentation](https://developer.android.com/google/play/billing)
- [Apple Store Server API Documentation](https://developer.apple.com/documentation/appstoreserverapi)
- [Stripe Documentation](https://stripe.com/docs)
- [RazorPay Documentation](https://razorpay.com/docs/)

## Configuration Checklist

### Google Play Store
- [ ] Service account created
- [ ] Private key downloaded
- [ ] App configured in Google Play Console
- [ ] Subscription products created
- [ ] Webhook URL configured
- [ ] Test accounts added

### Apple Store
- [ ] App Store Connect API key created
- [ ] Private key file downloaded
- [ ] App configured in App Store Connect
- [ ] Subscription products created
- [ ] Webhook URL configured
- [ ] Sandbox testers added

### Stripe
- [ ] Stripe account created
- [ ] API keys generated
- [ ] Webhook endpoints configured
- [ ] Test mode verified
- [ ] Production mode tested

### General
- [ ] Environment variables configured
- [ ] Database indexes created
- [ ] Error handling implemented
- [ ] Logging configured
- [ ] Monitoring set up
- [ ] Security measures implemented 