<template>
  <!--
    ╔══════════════════════════════════════════════════════════════════════╗
    ║  POS — نقطة البيع                                                      ║
    ║  Two responsive zones: المنتجات (left/main) + السلة (right/drawer).    ║
    ║  Desktop/tablet → side-by-side grid. Mobile → cart slides in as an     ║
    ║  off-canvas drawer with a sticky checkout bar.                         ║
    ║  Business logic (pricing, discounts, tax, units, drafts, period gate,  ║
    ║  permissions) is untouched — this is a presentation rebuild only.      ║
    ╚══════════════════════════════════════════════════════════════════════╝
  -->
  <v-alert
    v-if="!hasActivePeriod"
    type="warning"
    variant="tonal"
    density="comfortable"
    border="start"
    class="mb-3"
  >
    <div class="d-flex align-center justify-space-between flex-wrap ga-3">
      <div>
        <div class="text-subtitle-2 font-weight-bold">{{ periodDialogTitle }}</div>
        <div class="text-body-2">{{ shiftBlockReason }}</div>
      </div>
      <v-btn color="warning" variant="flat" size="small" :to="shiftBlockAction.to">
        {{ shiftBlockAction.label }}
      </v-btn>
    </div>
  </v-alert>
  <div class="pos" :class="{ 'pos--drawer': isMobile, 'pos--cart-open': cartOpen }" dir="rtl">
    <!-- ═══════════════════ Products zone ═══════════════════ -->
    <v-card class="pos__panel pos__products" flat aria-label="المنتجات">
      <!-- Accounting-period gate (القيد المحاسبي): selling needs a usable open
           period. The banner points the cashier at the fix; actions stay
           blocked by `hasActivePeriod` regardless. -->

      <!-- ── Toolbar: unified search/barcode + category + tier + filter ── -->
      <div class="pos__toolbar">
        <!-- One field for search AND barcode: typing filters the grid (debounced)
             while Enter resolves an exact barcode/SKU scan or a single match. -->
        <v-text-field
          ref="searchRef"
          v-model="searchInput"
          data-testid="pos-search"
          class="pos__search"
          variant="solo-filled"
          density="comfortable"
          flat
          rounded="lg"
          hide-details
          clearable
          autocomplete="off"
          placeholder="ابحث بالاسم / SKU أو امسح الباركود ثم Enter"
          prepend-inner-icon="mdi-magnify"
          @keyup.enter="onSearchEnter"
          @keydown.esc.prevent="searchInput = ''"
          @keydown.down.prevent="focusFirstCard"
        >
          <template #append-inner>
            <v-icon size="18" class="pos__search-hint">mdi-barcode-scan</v-icon>
          </template>
        </v-text-field>

        <div class="pos__filters">
          <!-- Categories as a searchable select (replaces the old chip row). -->
          <v-autocomplete
            v-model="selectedCategory"
            :items="categoryOptions"
            item-title="title"
            item-value="value"
            class="pos__category"
            variant="solo-filled"
            density="comfortable"
            flat
            rounded="lg"
            hide-details
            clearable
            menu-icon="mdi-chevron-down"
            placeholder="كل التصنيفات"
            prepend-inner-icon="mdi-shape-outline"
            no-data-text="لا توجد تصنيفات"
          />

          <!-- Pricing tier (تسعير الوكلاء) — only when the feature is on. -->
          <v-btn-toggle
            v-if="agentPricingOn"
            :model-value="priceType"
            color="primary"
            variant="elevated"
            class="pos__tiers"
            aria-label="نوع التسعيرة"
            @update:model-value="setPriceType"
          >
            <v-btn v-for="tier in PRICE_TIERS" :key="tier.value" :value="tier.value" size="small">
              {{ tier.label }}
            </v-btn>
          </v-btn-toggle>

          <v-switch
            v-model="hideExpired"
            color="error"
            density="compact"
            hide-details
            inset
            label="إخفاء المنتهي"
            class="pos__expired"
          />
        </div>
      </div>

      <!-- ── Product grid ── -->
      <div ref="gridRef" class="pos__grid" role="grid" aria-live="polite" @keydown="onGridKey">
        <!-- Loading skeletons (mirror the real card: media block + text lines) -->
        <template v-if="loadingProducts">
          <v-card
            v-for="n in 12"
            :key="`sk-${n}`"
            class="pos-tile pos-tile--skeleton"
            rounded="lg"
            flat
            aria-hidden="true"
          >
            <div class="pos-tile__media sk-shimmer" />
            <div class="pos-tile__body">
              <div class="sk-line sk-shimmer" />
              <div class="sk-line sk-line--short sk-shimmer" />
              <div class="sk-line sk-line--price sk-shimmer" />
            </div>
          </v-card>
        </template>

        <!-- Empty state -->
        <div v-else-if="filteredProducts.length === 0" class="pos__empty">
          <EmptyState
            :icon="
              debouncedSearch || selectedCategory
                ? 'mdi-magnify-close'
                : 'mdi-package-variant-closed'
            "
            :title="debouncedSearch || selectedCategory ? 'لا نتائج' : 'لا توجد منتجات'"
            :description="
              debouncedSearch || selectedCategory
                ? 'جرّب تعديل البحث أو التصنيف.'
                : 'أضف منتجات من شاشة المنتجات لبدء البيع.'
            "
          />
        </div>

        <!-- Product cards (one page at a time: see paginatedProducts) -->
        <v-card
          v-for="p in paginatedProducts"
          v-else
          :key="p.id"
          v-memo="[
            p.id,
            availableOf(p),
            p.sellingPrice,
            p.name,
            p.sku,
            isFeatured(p),
            isService(p),
            expiryStatusOf(p),
            productImageOf(p),
          ]"
          data-testid="pos-product"
          :data-product-id="p.id"
          :data-product-name="p.name"
          class="pos-tile"
          :class="{ 'pos-tile--disabled': !isSellable(p) || expiryStatusOf(p) === 'منتهي' }"
          :ripple="isSellable(p) && expiryStatusOf(p) !== 'منتهي'"
          :tabindex="!isSellable(p) || expiryStatusOf(p) === 'منتهي' ? -1 : 0"
          role="gridcell"
          @click="isSellable(p) && expiryStatusOf(p) !== 'منتهي' && addProduct(p)"
          @keydown.enter.prevent="isSellable(p) && expiryStatusOf(p) !== 'منتهي' && addProduct(p)"
          @keydown.space.prevent="isSellable(p) && expiryStatusOf(p) !== 'منتهي' && addProduct(p)"
        >
          <!-- ── Media: real image or a clean, deterministic placeholder ── -->
          <div class="pos-tile__media">
            <div class="pos-tile__placeholder" :style="placeholderStyle(p)">
              <v-icon class="pos-tile__placeholder-icon" size="40"
                >mdi-package-variant-closed</v-icon
              >
            </div>

            <!-- Stock-status badge (متوفر / منخفض / نفذ / خدمة) -->
            <div class="pos-tile__status flex align-center justify-space-between ga-1">
              <v-chip size="x-small" :color="stockStatusOf(p).color" variant="flat" label>
                <v-icon start size="11">{{ stockStatusOf(p).icon }}</v-icon>
                {{ stockStatusOf(p).label }}
              </v-chip>

              <!-- :title="nearestExpiryOf(p) ? `${p.name} — أقرب انتهاء: ${nearestExpiryOf(p)}` : p.name" -->

              <v-chip
                v-if="nearestExpiryOf(p)"
                size="x-small"
                :color="expiryColor(expiryStatusOf(p))"
                variant="flat"
                label
              >
                <v-icon start size="11">mdi-calendar-clock</v-icon>
                {{ nearestExpiryOf(p) }}
              </v-chip>
            </div>
            <!-- Featured star -->
            <v-icon v-if="isFeatured(p)" class="pos-tile__star" size="15" aria-label="مميّز">
              mdi-star
            </v-icon>

            <!-- Near/expired flag -->
            <v-chip
              v-if="expiryStatusOf(p) === 'ينتهي قريباً' || expiryStatusOf(p) === 'منتهي'"
              class="pos-tile__expiry"
              size="x-small"
              :color="expiryColor(expiryStatusOf(p))"
              variant="flat"
              label
            >
              {{ expiryStatusOf(p) }}
            </v-chip>

            <!-- Quick add (+) -->
            <v-btn
              v-if="isSellable(p) && expiryStatusOf(p) !== 'منتهي'"
              class="pos-tile__add"
              icon="mdi-plus"
              size="small"
              color="primary"
              variant="flat"
              :aria-label="`إضافة ${p.name}`"
              @click.stop="addProduct(p)"
            />
          </div>

          <!-- ── Body: name + SKU + price ── -->
          <div class="pos-tile__body">
            <div class="pos-tile__name" :title="p.name">{{ p.name }}</div>
            <div class="pos-tile__sku">
              <v-icon size="12">mdi-pound</v-icon>
              <span>{{ p.sku || p.barcode || p.id }}</span>
            </div>
            <div class="pos-tile__foot">
              <span class="pos-tile__price">{{ formatMoney(p.sellingPrice, p.currency) }}</span>
              <span
                v-if="!isService(p)"
                class="pos-tile__count"
                :title="`المتوفر: ${availableOf(p)}`"
              >
                <v-icon size="12">mdi-cube-outline</v-icon>{{ availableOf(p) }}
              </span>
            </div>
          </div>
        </v-card>
      </div>

      <!-- ── Pagination bar (products area only; stays out of the scroll) ── -->
      <div
        v-if="!loadingProducts && filteredProducts.length > 0"
        class="pos__pager"
        :class="{
          'pos__pager--mobile': isMobile,
        }"
      >
        <v-select
          v-model="productsPerPage"
          :items="PER_PAGE_OPTIONS"
          density="compact"
          variant="outlined"
          hide-details
          label="لكل صفحة"
          class="pos__pager-size"
        />
        <span class="pos__pager-count">
          {{ pageRangeStart }}–{{ pageRangeEnd }} من {{ filteredProducts.length }}
        </span>
        <v-pagination
          v-model="productPage"
          :length="totalProductPages"
          :total-visible="isMobile ? 3 : 7"
          density="comfortable"
          class="pos__pager-nav"
        />
      </div>
    </v-card>

    <!-- ═══════════════════ Cart zone ═══════════════════ -->
    <v-card class="pos__panel pos__cart" :class="{ 'is-open': cartOpen }" flat aria-label="السلة">
      <!-- Mobile drag handle -->
      <div v-if="isMobile" class="cart__handle" @click="cartOpen = false">
        <span class="cart__handle-bar" />
      </div>

      <!-- ── Header ── -->
      <div class="cart__header">
        <div class="cart__title">
          <v-icon size="20" color="primary">mdi-cart-variant</v-icon>
          <span class="cart__title-text">السلة</span>
          <v-chip v-if="itemCount > 0" size="x-small" color="primary" variant="flat">
            {{ itemCount }}
          </v-chip>
        </div>

        <div class="cart__header-actions">
          <v-tooltip location="bottom" :text="draftsReason" :disabled="!draftsDisabled">
            <template #activator="{ props: tipProps }">
              <span v-bind="tipProps">
                <v-btn
                  v-if="draftsVisible"
                  size="small"
                  variant="text"
                  :color="currentDraftId ? 'primary' : undefined"
                  :prepend-icon="draftsDisabled ? 'mdi-lock-outline' : 'mdi-archive-clock-outline'"
                  :disabled="draftsDisabled"
                  @click="openDraftsList"
                >
                  المسودات
                  <v-chip
                    v-if="currentDraftId && !draftsDisabled"
                    size="x-small"
                    class="ms-1"
                    color="primary"
                  >
                    #{{ currentDraftId }}
                  </v-chip>
                </v-btn>
              </span>
            </template>
          </v-tooltip>

          <v-btn
            v-if="items.length > 0"
            size="small"
            variant="text"
            color="error"
            prepend-icon="mdi-delete-sweep-outline"
            @click="confirmClear"
          >
            تفريغ
          </v-btn>
        </div>
      </div>

      <v-divider />

      <!-- ── Lines ── -->
      <div class="cart__lines" aria-live="polite">
        <!-- Draft-load skeleton -->
        <div
          v-if="continuingDraftId && items.length === 0"
          class="cart__lines-inner"
          aria-hidden="true"
        >
          <v-sheet v-for="n in 3" :key="`cart-sk-${n}`" class="line line--skeleton" rounded="lg" />
        </div>

        <!-- Empty -->
        <div v-else-if="items.length === 0" class="cart__empty">
          <EmptyState
            compact
            icon="mdi-cart-outline"
            :icon-size="44"
            title="السلة فارغة"
            description="اختر منتجاً أو امسح باركود لبدء البيع."
          />
          <div class="cart__hints">
            <v-chip size="small" variant="tonal"><kbd>F2</kbd>&nbsp;بحث</v-chip>
            <v-chip size="small" variant="tonal"><kbd>F9</kbd>&nbsp;دفع</v-chip>
          </div>
        </div>

        <!-- Items -->
        <TransitionGroup v-else name="line-anim" tag="div" class="cart__lines-inner">
          <v-card
            v-for="item in items"
            :key="item.id"
            class="line"
            :class="{ 'line--flash': flashItemId === item.id }"
            rounded="lg"
            variant="tonal"
            color="surface"
          >
            <!-- Row 1: name + per-line actions -->
            <div class="line__top">
              <div class="line__name" :title="item.name">{{ item.name }}</div>
              <div class="line__actions">
                <v-btn
                  icon="mdi-tune-variant"
                  size="x-small"
                  variant="text"
                  color="primary"
                  title="خصم / ملاحظة"
                  @click.stop="openLineEdit(item)"
                />
                <v-btn
                  icon="mdi-trash-can-outline"
                  size="x-small"
                  variant="text"
                  color="error"
                  :title="`إزالة ${item.name}`"
                  @click.stop="removeItem(item.id)"
                />
              </div>
            </div>

            <!-- Row 2: unit price + unit picker + chips -->
            <div class="line__meta">
              <span class="line__unit-price">
                {{ formatMoney(Math.max(0, item.price - item.discount), currency) }}
              </span>
              <span class="line__sep">·</span>
              <span class="line__unit-label">
                {{ item.unitName ? `سعر ${item.unitName}` : 'للوحدة' }}
              </span>

              <v-menu v-if="item.units && item.units.length > 1" location="bottom start">
                <template #activator="{ props: menuProps }">
                  <v-btn
                    v-bind="menuProps"
                    size="x-small"
                    variant="tonal"
                    color="primary"
                    prepend-icon="mdi-swap-horizontal"
                    class="line__unit-btn"
                    @click.stop
                  >
                    {{ item.unitName || 'الوحدة' }}
                  </v-btn>
                </template>
                <v-list density="compact">
                  <v-list-item
                    v-for="u in item.units"
                    :key="u.id"
                    :active="u.id === item.unitId"
                    :disabled="u.isActive === false"
                    @click="updateLineUnit(item.id, u.id)"
                  >
                    <v-list-item-title>
                      {{ u.name }}
                      <span v-if="!u.isBase" class="text-caption text-medium-emphasis">
                        (يعادل {{ Number(u.conversionFactor) || 1 }})
                      </span>
                    </v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>

              <v-chip v-if="item.discount > 0" size="x-small" color="warning" variant="tonal" label>
                <v-icon start size="11">mdi-tag-outline</v-icon>خصم
              </v-chip>
              <v-chip v-if="item.note" size="x-small" variant="tonal" label :title="item.note">
                <v-icon start size="11">mdi-note-text-outline</v-icon>{{ truncate(item.note, 14) }}
              </v-chip>
            </div>

            <!-- Service line: السعر المستلم (required; no fixed stored price) -->
            <div v-if="isService(item)" class="line__service-price" @click.stop>
              <v-text-field
                :model-value="item.price || ''"
                :data-testid="`pos-service-price-${item.productId}`"
                type="number"
                min="0"
                variant="outlined"
                density="compact"
                hide-details
                hide-spin-buttons
                label="السعر المستلم"
                :error="!(Number(item.price) > 0)"
                prepend-inner-icon="mdi-cash-edit"
                @update:model-value="(v) => updatePrice(item.id, v)"
              />
            </div>

            <div v-if="cartExpiryWarning(item)" class="line__warn">
              <v-icon size="13">mdi-alert-outline</v-icon>
              {{ cartExpiryWarning(item) }}
            </div>

            <!-- Row 3: qty stepper + line total -->
            <div class="line__bottom">
              <div class="line__qty" @click.stop>
                <v-btn
                  icon="mdi-minus"
                  size="x-small"
                  variant="tonal"
                  density="comfortable"
                  aria-label="إنقاص"
                  @click="decQty(item.id)"
                />
                <v-text-field
                  :model-value="item.qty"
                  type="number"
                  :min="1"
                  variant="outlined"
                  density="compact"
                  hide-details
                  hide-spin-buttons
                  class="line__qty-input"
                  inputmode="numeric"
                  @click.stop
                  @blur="(e) => commitQty(item.id, e.target.value)"
                  @keyup.enter="
                    (e) => {
                      commitQty(item.id, e.target.value);
                      e.target.blur();
                    }
                  "
                />
                <v-btn
                  icon="mdi-plus"
                  size="x-small"
                  variant="tonal"
                  density="comfortable"
                  aria-label="زيادة"
                  @click="incQty(item.id)"
                />
              </div>

              <div class="line__total">{{ formatMoney(lineSubtotal(item), currency) }}</div>
            </div>
          </v-card>
        </TransitionGroup>
      </div>

      <!-- ── Pay / footer ── -->
      <div class="cart__pay">
        <!-- Total breakdown (only when a discount or tax applies) -->
        <div v-if="discountValue > 0 || taxValue > 0" class="pay__breakdown">
          <div class="pay__row">
            <span>المجموع الفرعي</span>
            <span>{{ formatMoney(subtotal, currency) }}</span>
          </div>
          <div v-if="discountValue > 0" class="pay__row pay__row--warning">
            <span>الخصم</span>
            <span>− {{ formatMoney(discountValue, currency) }}</span>
          </div>
          <div v-if="taxValue > 0" class="pay__row">
            <span>الضريبة (%{{ tax.value }})</span>
            <span>{{ formatMoney(taxValue, currency) }}</span>
          </div>
        </div>

        <div class="pay__total">
          <span class="pay__total-label">الإجمالي</span>
          <span class="pay__total-value" data-testid="pos-total">{{
            formatMoney(total, currency)
          }}</span>
        </div>

        <!-- Collapsible discount / tax -->
        <v-expansion-panels variant="accordion" class="pay__expander">
          <v-expansion-panel rounded="lg">
            <v-expansion-panel-title>
              <v-icon size="18" start>mdi-tag-multiple-outline</v-icon>
              خيارات — خصم / ضريبة / ملاحظة
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <div class="pay__adjust">
                <v-number-input
                  v-model.number="saleDiscount.value"
                  type="number"
                  :min="0"
                  variant="outlined"
                  density="compact"
                  hide-details
                  control-variant="split"
                  label="خصم"
                >
                  <template #prepend>
                    <v-btn-toggle
                      v-model="saleDiscount.type"
                      mandatory
                      density="compact"
                      color="primary"
                      variant="outlined"
                    >
                      <v-btn value="amount" size="x-small" icon="mdi-cash" />
                      <v-btn value="percent" size="x-small" icon="mdi-percent" />
                    </v-btn-toggle>
                  </template>
                </v-number-input>

                <v-number-input
                  v-model.number="tax.value"
                  type="number"
                  :min="0"
                  variant="outlined"
                  density="compact"
                  hide-details
                  control-variant="split"
                  label="ضريبة %"
                  :readonly="!tax.enabled"
                >
                  <template #prepend>
                    <v-switch
                      v-model="tax.enabled"
                      density="compact"
                      color="primary"
                      hide-details
                    />
                  </template>
                </v-number-input>

                <!-- Invoice-level note: saved with the sale and shown on the
                     sale-details page. Capped at 1000 chars (counter + backend
                     schema). -->
                <v-textarea
                  v-model="saleNotes"
                  data-testid="pos-sale-notes"
                  label="ملاحظة الفاتورة (اختياري)"
                  placeholder="تُحفظ مع الفاتورة وتظهر في تفاصيل البيع"
                  variant="outlined"
                  density="compact"
                  rows="2"
                  auto-grow
                  no-resize
                  counter="1000"
                  maxlength="1000"
                  prepend-inner-icon="mdi-note-text-outline"
                />
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <!-- Payment method -->
        <v-btn-toggle
          :model-value="payment.method"
          class="pay__methods"
          color="primary"
          aria-label="طريقة الدفع"
          @update:model-value="onMethodChange"
        >
          <v-btn
            v-for="m in paymentMethods"
            :key="m.value"
            :value="m.value"
            :data-testid="`pos-pay-method-${m.value}`"
            :prepend-icon="m.icon"
            variant="elevated"
          >
            {{ m.label }}
          </v-btn>
        </v-btn-toggle>

        <!-- Card reference (card only) -->
        <v-text-field
          v-if="payment.method === 'card'"
          v-model="payment.reference"
          data-testid="pos-card-ref"
          variant="outlined"
          density="compact"
          hide-details="auto"
          label="مرجع البطاقة *"
          placeholder="رقم العملية أو الوصل"
          autocomplete="off"
          prepend-inner-icon="mdi-credit-card-outline"
          class="mt-2"
        />

        <!-- Paid + change readout -->
        <div class="pay__readout" :class="changeStateClass">
          <div class="pay__readout-row">
            <span class="pay__readout-label">المستلم</span>
            <span v-if="paidInput" class="pay__readout-typed">{{ paidInput }}</span>
            <span class="pay__readout-amount">{{
              formatMoney(payment.paidAmount || 0, currency)
            }}</span>
          </div>
          <div class="pay__readout-row pay__readout-row--delta">
            <v-icon size="15">{{ changeIcon }}</v-icon>
            <span class="pay__readout-label">{{ changeLabel }}</span>
            <span class="pay__readout-amount">{{ formatMoney(changeAmount, currency) }}</span>
          </div>
        </div>

        <!-- Collapsible numpad -->
        <v-expansion-panels variant="accordion" class="pay__expander">
          <v-expansion-panel rounded="lg">
            <v-expansion-panel-title>
              <v-icon size="18" start>mdi-dialpad</v-icon>
              لوحة الأرقام — إدخال يدوي
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <div class="numpad__quick">
                <v-btn
                  v-for="a in quickAmounts"
                  :key="a"
                  size="small"
                  variant="tonal"
                  :title="`+ ${formatMoney(a, currency)}`"
                  @click="addToPaid(a)"
                >
                  +{{ shortAmount(a) }}
                </v-btn>
              </div>
              <div class="numpad__keys">
                <v-btn
                  v-for="k in numpadKeys"
                  :key="k.value"
                  size="large"
                  variant="tonal"
                  :color="k.value === 'back' ? 'error' : undefined"
                  :aria-label="k.aria || k.label"
                  @click="onNumpad(k.value)"
                >
                  <v-icon v-if="k.icon" size="22">{{ k.icon }}</v-icon>
                  <span v-else>{{ k.label }}</span>
                </v-btn>
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <!-- Tender utilities -->
        <div class="pay__utils">
          <v-btn
            data-testid="pos-pay-full"
            color="success"
            variant="elevated"
            prepend-icon="mdi-cash-multiple"
            :disabled="items.length === 0 || fullAmountDisabled"
            :title="fullAmountDisabled ? 'غير متاح لفواتير الخدمات — تدفع بالسعر المستلم' : undefined"
            @click="onFullPayment"
          >
            المبلغ كامل
          </v-btn>
          <v-btn
            variant="text"
            color="error"
            prepend-icon="mdi-refresh"
            :disabled="!paidInput"
            @click="onNumpad('clear')"
          >
            تصفير
          </v-btn>
        </div>

        <!-- Primary actions -->
        <div class="pay__actions">
          <v-tooltip location="top" :text="draftsReason" :disabled="!draftsDisabled">
            <template #activator="{ props: tipProps }">
              <span v-bind="tipProps" class="pay__draft-wrap">
                <v-btn
                  v-if="draftsVisible"
                  variant="outlined"
                  size="large"
                  block
                  prepend-icon="mdi-content-save-outline"
                  :disabled="draftsDisabled || items.length === 0 || submitting || !hasActivePeriod"
                  @click="onHold"
                >
                  مسودة
                </v-btn>
              </span>
            </template>
          </v-tooltip>

          <v-btn
            data-testid="pos-checkout"
            size="large"
            color="primary"
            class="pay__checkout"
            :loading="submitting"
            :disabled="!canSubmit || !hasActivePeriod"
            @click="checkout"
          >
            <v-icon start>mdi-check-circle-outline</v-icon>
            دفع وإتمام
            <span class="pay__hotkey">F9</span>
          </v-btn>
        </div>
      </div>
    </v-card>

    <!-- ═══════════════════ Mobile bits ═══════════════════ -->
    <!-- Backdrop behind the drawer -->
    <v-fade-transition>
      <div v-if="isMobile && cartOpen" class="pos__backdrop" @click="cartOpen = false" />
    </v-fade-transition>

    <!-- Sticky bottom bar (mobile, cart closed): live count + total, opens the
         cart where payment is completed. The catalogue stays visible while the
         cashier keeps scanning/tapping — the bar just reflects the running cart. -->
    <div v-if="isMobile && !cartOpen" class="pos__bottombar">
      <v-btn
        class="pos__bottombar-cart"
        color="primary"
        variant="flat"
        size="large"
        block
        append-icon="mdi-chevron-up"
        @click="cartOpen = true"
      >
        <v-badge :content="itemCount" :model-value="itemCount > 0" color="error" class="me-3">
          <v-icon size="22">mdi-cart-variant</v-icon>
        </v-badge>
        <span>عرض السلة</span>
        <v-spacer />
        <span class="font-weight-bold">{{ formatMoney(total, currency) }}</span>
      </v-btn>
    </div>

    <!-- ═══════════════════ Overlays / dialogs ═══════════════════ -->
    <!-- Per-line edit (discount + note) -->
    <v-dialog v-model="lineEditOpen" max-width="440">
      <v-card v-if="lineEditItem" rounded="lg">
        <v-card-title>
          <div>{{ lineEditItem.name }}</div>
          <div class="text-caption text-medium-emphasis">
            السعر: {{ formatMoney(lineEditItem.price, currency) }}
          </div>
        </v-card-title>
        <v-card-text class="d-flex flex-column ga-3">
          <v-text-field
            v-model.number="lineEditDraft.discount"
            type="number"
            :min="0"
            :max="lineEditItem.price"
            label="خصم / وحدة"
            variant="outlined"
            density="comfortable"
            hide-details
          />
          <v-text-field
            v-model="lineEditDraft.note"
            label="ملاحظة"
            variant="outlined"
            density="comfortable"
            hide-details
            autofocus
          />
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="lineEditOpen = false">إلغاء</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="flat" @click="saveLineEdit">حفظ</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ConfirmDialog
      v-model="clearDialog"
      title="تفريغ السلة"
      message="هل تريد إزالة كل المنتجات من السلة؟"
      type="warning"
      confirm-text="تفريغ"
      cancel-text="إلغاء"
      @confirm="clear"
    />

    <!-- Drafts list (POS-compatible cash drafts only) -->
    <v-dialog v-model="draftsOpen" max-width="640" scrollable>
      <v-card rounded="lg">
        <v-card-title>
          <div class="d-flex align-center ga-2">
            <v-icon size="22">mdi-archive-clock-outline</v-icon>
            <span>المسودات (POS)</span>
            <v-spacer />
            <v-btn
              icon="mdi-refresh"
              variant="text"
              size="small"
              :loading="draftsLoading"
              title="تحديث"
              @click="loadDrafts"
            />
          </div>
          <v-text-field
            v-model="draftsSearch"
            density="comfortable"
            variant="outlined"
            hide-details
            clearable
            placeholder="بحث برقم الفاتورة أو اسم العميل"
            prepend-inner-icon="mdi-magnify"
            class="mt-3"
          />
        </v-card-title>

        <v-card-text style="min-height: 240px">
          <div v-if="draftsLoading && draftList.length === 0" class="drafts__state">
            <v-progress-circular indeterminate color="primary" />
            <div class="text-medium-emphasis mt-2">جاري التحميل…</div>
          </div>
          <div v-else-if="draftsError" class="drafts__state">
            <v-icon size="40" color="error">mdi-alert-circle-outline</v-icon>
            <div class="text-body-2 mt-2">{{ draftsError }}</div>
            <v-btn
              class="mt-3"
              variant="outlined"
              size="small"
              prepend-icon="mdi-refresh"
              @click="loadDrafts"
            >
              إعادة المحاولة
            </v-btn>
          </div>
          <div v-else-if="filteredDrafts.length === 0" class="drafts__state">
            <v-icon size="40" class="text-medium-emphasis">mdi-tray-remove</v-icon>
            <div class="text-body-2 text-medium-emphasis mt-2">
              {{ draftsSearch ? 'لا توجد مسودات مطابقة' : 'لا توجد مسودات للـ POS' }}
            </div>
          </div>
          <v-list v-else lines="two" class="bg-transparent">
            <v-list-item
              v-for="d in filteredDrafts"
              :key="d.id"
              class="drafts__item mb-2"
              rounded="lg"
            >
              <template #title>
                <div class="d-flex align-center justify-space-between">
                  <span class="font-weight-bold">{{ d.invoiceNumber || `#${d.id}` }}</span>
                  <span class="text-primary font-weight-bold">{{
                    formatMoney(d.total, d.currency)
                  }}</span>
                </div>
              </template>
              <template #subtitle>
                <div class="d-flex flex-wrap ga-3 text-caption mt-1">
                  <span
                    ><v-icon size="14">mdi-account-outline</v-icon>
                    {{ d.customer || 'بدون عميل' }}</span
                  >
                  <span
                    ><v-icon size="14">mdi-package-variant-closed</v-icon>
                    {{ d.itemCount ?? 0 }} عنصر</span
                  >
                  <span
                    ><v-icon size="14">mdi-clock-outline</v-icon>
                    {{ formatDraftDate(d.createdAt) }}</span
                  >
                </div>
              </template>
              <template #append>
                <div class="d-flex ga-1">
                  <v-btn
                    variant="flat"
                    color="primary"
                    size="small"
                    prepend-icon="mdi-play-circle-outline"
                    :loading="continuingDraftId === d.id"
                    :disabled="!!continuingDraftId || deletingDraftId === d.id"
                    @click="continueDraft(d)"
                  >
                    متابعة
                  </v-btn>
                  <v-btn
                    icon="mdi-trash-can-outline"
                    variant="text"
                    color="error"
                    size="small"
                    :loading="deletingDraftId === d.id"
                    :disabled="!!continuingDraftId || !!deletingDraftId"
                    @click="askDeleteDraft(d)"
                  />
                </div>
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="draftsOpen = false">إغلاق</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ConfirmDialog
      v-model="draftDeleteDialog"
      title="حذف المسودة"
      :message="
        draftPendingDelete
          ? `هل تريد حذف المسودة ${draftPendingDelete.invoiceNumber || '#' + draftPendingDelete.id}؟`
          : ''
      "
      type="warning"
      confirm-text="حذف"
      cancel-text="إلغاء"
      @confirm="confirmDeleteDraft"
    />

    <ConfirmDialog
      v-model="draftReplaceDialog"
      title="استبدال السلة الحالية"
      message="السلة الحالية تحتوي عناصر. هل تريد تفريغها وتحميل المسودة؟"
      type="warning"
      confirm-text="استبدال"
      cancel-text="إلغاء"
      @confirm="confirmReplaceWithDraft"
    />

    <!-- Blocking dialog: period-gated action attempted without an open period. -->
    <v-dialog v-model="mustOpenPeriodDialog" max-width="460">
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center ga-2">
          <v-icon color="warning">mdi-book-alert-outline</v-icon>
          <span>{{ periodDialogTitle }}</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <p class="text-body-1 mb-2">لا يمكن إتمام عمليات البيع قبل فتح قيد محاسبي.</p>
          <p class="text-body-2 text-medium-emphasis mb-0">{{ shiftBlockReason }}</p>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="mustOpenPeriodDialog = false">إغلاق</v-btn>
          <v-btn
            color="primary"
            variant="elevated"
            prepend-icon="mdi-book-plus-outline"
            @click="goToPeriodFix"
          >
            {{ shiftBlockAction.label }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter, useRoute, isNavigationFailure } from 'vue-router';
import { useDisplay } from 'vuetify';
import {
  useProductStore,
  useCategoryStore,
  useInventoryStore,
  useSettingsStore,
  useNotificationStore,
  useSaleStore,
} from '@/stores';
import { useAccountingPeriodStore } from '@/stores/accountingPeriod';
import { useAuthStore } from '@/stores/auth';
import { usePosCart } from '@/composables/usePosCart';
import { useFeatureGate } from '@/composables/useFeatureGate';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import EmptyState from '@/components/EmptyState.vue';
import api from '@/plugins/axios';
import { formatCurrency as formatMoney } from '@/utils/formatters';
import { PRICE_TIERS } from '@/utils/productUnits';

// ── Stores ──────────────────────────────────────────────────────────────────
const productStore = useProductStore();
const categoryStore = useCategoryStore();
const inventoryStore = useInventoryStore();
const settingsStore = useSettingsStore();
const notify = useNotificationStore();
const saleStore = useSaleStore();
const accountingPeriodStore = useAccountingPeriodStore();
const authStore = useAuthStore();

// Capability-driven UI: the "save as draft" button is only meaningful when
// the draftInvoices module is enabled AND the user has the capability.
// We split the check so that users who hold the capability still see the
// button — disabled with a tooltip — when only the feature flag is off.
const draftsGate = useFeatureGate('draftInvoices', 'canUseDraftInvoices');
const canUseDrafts = computed(() => draftsGate.enabled.value);
const draftsVisible = draftsGate.visible;
const draftsDisabled = draftsGate.disabled;
const draftsReason = draftsGate.reason;
const router = useRouter();
const route = useRoute();

// Tracks the draft id we resumed from, so checkout can complete it instead of
// creating a brand-new sale (and leaving the draft orphaned in the DB).
const currentDraftId = ref(null);

// Selling is gated by the accounting period only (shifts were removed).
const accountingPeriodsEnabled = computed(
  () => authStore.hasFeature?.('accountingPeriods') === true
);
const multiBranchEnabled = computed(() => authStore.hasFeature?.('multiBranch') === true);
// Wholesale/agent price tiers (تسعير الوكلاء) — gates the price-type selector.
const agentPricingOn = computed(() => authStore.hasFeature?.('agentPricing') === true);
const currentBranchId = computed(
  () => inventoryStore.selectedBranchId || authStore.assignedBranchId || null
);
const activeAccountingPeriod = computed(() => accountingPeriodStore.current);

// In branch mode the open period must belong to the selected branch; in single
// mode any open (global) period suffices.
const hasOpenPeriodForBranch = computed(() => {
  const p = activeAccountingPeriod.value;
  if (!p) return false;
  if (multiBranchEnabled.value) {
    return Number(p.branchId) === Number(currentBranchId.value);
  }
  return true;
});

// "POS may proceed (period-wise)." The accounting-period requirement is GATED
// by the feature flag (matches the backend):
//   - feature OFF → legacy POS: no period needed, nothing is blocked.
//   - feature ON  → a usable OPEN period for this scope is required to open a
//     shift or sell (the period is the root container).
const hasActivePeriod = computed(
  () => !accountingPeriodsEnabled.value || hasOpenPeriodForBranch.value
);

// The specific Arabic reason selling is blocked ('' when it can proceed).
const shiftBlockReason = computed(() => {
  if (!accountingPeriodsEnabled.value) return 'نظام القيد المحاسبي غير مفعّل.';
  if (!activeAccountingPeriod.value) return 'لا يوجد قيد محاسبي مفتوح — افتح قيداً أولاً.';
  if (
    multiBranchEnabled.value &&
    Number(activeAccountingPeriod.value.branchId) !== Number(currentBranchId.value)
  ) {
    return 'لا يوجد قيد محاسبي مفتوح لهذا الفرع.';
  }
  return '';
});

// Where the banner / dialog call-to-action points: enable the system (settings)
// vs open a new period (المالية → القيود المحاسبية → فتح قيد جديد).
const shiftBlockAction = computed(() =>
  !accountingPeriodsEnabled.value
    ? { label: 'الانتقال إلى الإعدادات', to: { name: 'Settings' } }
    : { label: 'فتح قيد جديد', to: { name: 'AccountingPeriods' } }
);
const periodDialogTitle = computed(() =>
  !accountingPeriodsEnabled.value ? 'نظام القيد المحاسبي غير مفعل' : 'يجب فتح قيد محاسبي'
);

// The blocking dialog. Opened whenever a period-gated action is attempted
// without a usable open period; its action navigates to the fix.
const mustOpenPeriodDialog = ref(false);
const ensureActivePeriodOrWarn = () => {
  if (hasActivePeriod.value) return true;
  mustOpenPeriodDialog.value = true;
  return false;
};
const goToPeriodFix = () => {
  mustOpenPeriodDialog.value = false;
  router.push(shiftBlockAction.value.to);
};

// Timer handle for the open-period poll (cleared on unmount).
let periodPollTimer = null;
const refreshCurrentAccountingPeriod = async () => {
  if (!accountingPeriodsEnabled.value) {
    accountingPeriodStore.current = null; // drop stale state when the system is off
    return;
  }
  await accountingPeriodStore.fetchCurrent(currentBranchId.value || undefined).catch(() => {});
};

// Drawer mode (cart slides over content) for small screens; md+ is side-by-side.
const { smAndDown: isMobile } = useDisplay();

// ── Cart composable ────────────────────────────────────────────────────────
// Day-to-day POS: no customer, no instalments — anonymous cash/card sales.
const {
  currency,
  items,
  saleDiscount,
  tax,
  payment,
  submitting,

  subtotal,
  discountValue,
  taxValue,
  total,
  change,
  remaining,
  itemCount,
  fullAmountDisabled,
  canSubmit,
  lineSubtotal,
  priceType,
  // Invoice-level note (ملاحظة الفاتورة) — bound to the field in the cart footer
  // and sent inside the checkout payload by buildPayload().
  notes: saleNotes,

  addItem,
  removeItem,
  updateQty,
  incQty,
  decQty,
  updatePrice,
  updateLineDiscount,
  updateLineNote,
  updateLineUnit,
  setPriceType,
  clear,
  applyExact,
  addToPaid,
  setPaid,
  submit,
  holdAsDraft,
  loadDraft,
} = usePosCart();

// ── Local UI state ─────────────────────────────────────────────────────────
const searchInput = ref('');
const debouncedSearch = ref('');
const selectedCategory = ref(null);
const products = ref([]);
const expiryAlerts = ref([]);
const categories = ref([]);
const loadingProducts = ref(false);
const cartOpen = ref(false);
const clearDialog = ref(false);
const hideExpired = ref(false);

// Numpad: a free-typed string we own as the source of truth for the readout.
// Sync to/from payment.paidAmount so applyExact / addToPaid still drive it.
const paidInput = ref('');

watch(
  () => payment.paidAmount,
  (v) => {
    const cur = parseFloat(paidInput.value);
    if (Number.isFinite(cur) && cur === Number(v)) return;
    paidInput.value = Number(v) > 0 ? String(v) : '';
  }
);

// Per-line edit dialog state
const lineEditOpen = ref(false);
const lineEditItem = ref(null);
const lineEditDraft = reactive({ discount: 0, note: '' });

// ── Drafts list dialog state ─────────────────────────────────────────────
// Listing is restricted to POS-compatible (cash) drafts; installment drafts
// stay handled by NewSale.vue and never appear here.
const draftsOpen = ref(false);
const draftsLoading = ref(false);
const draftsError = ref('');
const draftList = ref([]);
const draftsSearch = ref('');
const continuingDraftId = ref(null);
const deletingDraftId = ref(null);
const draftDeleteDialog = ref(false);
const draftPendingDelete = ref(null);
const draftReplaceDialog = ref(false);
const draftPendingLoad = ref(null);

// Flash effect: highlights a cart line when it's newly added or its qty grew —
// gives the cashier positive confirmation that their click/scan landed.
const flashItemId = ref(null);
const lastLineQty = new Map();
let flashTimer = null;

watch(
  items,
  (curr) => {
    let flashId = null;
    for (const it of curr) {
      const prevQty = lastLineQty.get(it.id);
      if (prevQty === undefined || it.qty > prevQty) flashId = it.id;
    }
    lastLineQty.clear();
    for (const it of curr) lastLineQty.set(it.id, it.qty);

    if (flashId) {
      flashItemId.value = flashId;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        if (flashItemId.value === flashId) flashItemId.value = null;
      }, 900);
    }
  },
  { deep: true, flush: 'post' }
);

const truncate = (s, n) => {
  const str = String(s ?? '');
  return str.length > n ? `${str.slice(0, n)}…` : str;
};

const searchRef = ref(null);
const gridRef = ref(null);

let searchTimer = null;
watch(searchInput, (v) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    debouncedSearch.value = (v || '').trim().toLowerCase();
  }, 120);
});

// ── Payment UI config ──────────────────────────────────────────────────────
const paymentMethods = [
  { value: 'cash', label: 'نقداً', icon: 'mdi-cash' },
  { value: 'card', label: 'بطاقة', icon: 'mdi-credit-card-outline' },
];

const quickAmounts = computed(() =>
  currency.value === 'USD' ? [1, 5, 10, 20, 50, 100] : [1000, 5000, 10000, 25000, 50000]
);

// Numpad keys depend on currency: IQD gets "00" instead of "."
const numpadKeys = computed(() => {
  const digits = ['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((v) => ({
    value: v,
    label: v,
  }));
  const last =
    currency.value === 'USD'
      ? [
          { value: '.', label: '.' },
          { value: '0', label: '0' },
          { value: 'back', icon: 'mdi-backspace-outline', aria: 'مسح حرف' },
        ]
      : [
          { value: '00', label: '00' },
          { value: '0', label: '0' },
          { value: 'back', icon: 'mdi-backspace-outline', aria: 'مسح حرف' },
        ];
  return [...digits, ...last];
});

const onNumpad = (key) => {
  if (key === 'clear') {
    paidInput.value = '';
    setPaid(0);
    return;
  }
  if (key === 'back') {
    paidInput.value = paidInput.value.slice(0, -1);
    setPaid(parseFloat(paidInput.value) || 0);
    return;
  }
  if (key === '.') {
    if (paidInput.value.includes('.')) return;
    paidInput.value = paidInput.value ? paidInput.value + '.' : '0.';
    return; // no setPaid yet — trailing dot doesn't change numeric value
  }
  if (key === '00') {
    if (!paidInput.value) return; // skip leading zeros
    paidInput.value += '00';
    setPaid(parseFloat(paidInput.value) || 0);
    return;
  }
  // Digit
  paidInput.value = (paidInput.value || '') + key;
  setPaid(parseFloat(paidInput.value) || 0);
};

const onFullPayment = () => {
  applyExact();
  // The watcher on payment.paidAmount syncs paidInput automatically.
};

// Card sales are normally paid in full at point of swipe — auto-fill exact
// when the cashier switches to card so they don't have to re-type.
const onMethodChange = (m) => {
  if (!m) return; // mandatory toggle never emits null, but guard anyway
  payment.method = m;
  if (m === 'card' && total.value > 0 && payment.paidAmount !== total.value) {
    applyExact();
  }
};

// ── Derived product helpers ────────────────────────────────────────────────
const availableOf = (p) => Number(p?.warehouseStock ?? p?.totalStock ?? p?.stock ?? 0) || 0;

// Service products are never stocked — they are always sellable and never
// blocked by an availability check.
const isService = (p) => p?.productType === 'service';
// A product is sellable when it's a service (no stock gate) or has stock.
const isSellable = (p) => isService(p) || availableOf(p) > 0;

// Stock-status badge: a label + color + icon for the product card.
//   service → خدمة, out → نفذ, at/below threshold → منخفض, else → متوفر.
const stockStatusOf = (p) => {
  if (isService(p)) return { label: 'خدمة', color: 'secondary', icon: 'mdi-wrench-outline' };
  const q = availableOf(p);
  if (q <= 0) return { label: 'نفذ', color: 'error', icon: 'mdi-close-circle-outline' };
  const threshold =
    p.lowStockThreshold && p.lowStockThreshold > 0 ? p.lowStockThreshold : p.minStock || 0;
  if (q <= threshold) return { label: 'منخفض', color: 'warning', icon: 'mdi-alert-outline' };
  return { label: 'متوفر', color: 'success', icon: 'mdi-check-circle-outline' };
};

const isFeatured = (p) => Boolean(p?.isFeatured || p?.isBestSeller || p?.featured || p?.bestseller);

// ── Product card media ─────────────────────────────────────────────────────
// The catalogue has no image column yet; support several likely field names so
// the card lights up automatically once images ship, and fall back to a clean
// placeholder otherwise.
const productImageOf = (p) =>
  p?.imageUrl || p?.image || p?.thumbnail || p?.photo || p?.imagePath || null;

// Deterministic two-tone gradient per product so placeholders look varied but
// stay stable across renders (seeded by id, falling back to the name length).
const placeholderStyle = (p) => {
  const seed = Number(p?.id) || String(p?.name || '').length || 1;
  const hue = (seed * 47) % 360;
  return {
    '--ph-from': `hsl(${hue}, 52%, 50%)`,
    '--ph-to': `hsl(${(hue + 38) % 360}, 56%, 38%)`,
  };
};

// Shared search predicate — reused by the live grid filter and Enter handler so
// both stay perfectly in sync (barcode / SKU / name, case-insensitive).
const productMatchesTerm = (p, q) =>
  (p.name || '').toLowerCase().includes(q) ||
  (p.sku || '').toLowerCase().includes(q) ||
  (p.barcode || '').toLowerCase().includes(q);

const filteredProducts = computed(() => {
  const q = debouncedSearch.value;
  const catId = selectedCategory.value;
  const base = hideExpired.value
    ? products.value.filter((p) => expiryStatusOf(p) !== 'منتهي')
    : products.value;
  if (!q && catId == null) return base;

  return base.filter((p) => {
    if (catId != null && p.categoryId !== catId) return false;
    if (!q) return true;
    return productMatchesTerm(p, q);
  });
});

// ── Pagination (products area only) ────────────────────────────────────────
// The full catalogue is filtered client-side above (filteredProducts); we then
// page that result so the grid only ever mounts ONE page of cards no matter how
// large the catalogue is. The business/filter logic is untouched — this just
// slices the already-computed list for display.
const PER_PAGE_OPTIONS = [20, 40, 60, 100];
const productPage = ref(1);
const productsPerPage = ref(40);

const totalProductPages = computed(() =>
  Math.max(1, Math.ceil(filteredProducts.value.length / productsPerPage.value))
);
const paginatedProducts = computed(() => {
  const start = (productPage.value - 1) * productsPerPage.value;
  return filteredProducts.value.slice(start, start + productsPerPage.value);
});

// 1-based "X–Y من Z" range for the footer (0 when there are no matches).
const pageRangeStart = computed(() =>
  filteredProducts.value.length ? (productPage.value - 1) * productsPerPage.value + 1 : 0
);
const pageRangeEnd = computed(() =>
  Math.min(productPage.value * productsPerPage.value, filteredProducts.value.length)
);

// A new search term, category, or page size always returns to page 1. Adding a
// product to the cart does NOT touch any of these, so the current page (and the
// search field's focus) stay put — exactly what a cashier scanning expects.
watch([debouncedSearch, selectedCategory, productsPerPage], () => {
  productPage.value = 1;
});
// Defensive clamp: if the filtered set shrinks below the current page (e.g.
// toggling "إخفاء المنتهي"), snap back into range instead of showing a blank page.
watch(totalProductPages, (pages) => {
  if (productPage.value > pages) productPage.value = pages;
});
// Scroll the grid back to the top whenever the visible page changes.
watch(productPage, () => {
  nextTick(() => gridRef.value?.scrollTo?.({ top: 0 }));
});

const expiryByProductWarehouse = computed(() => {
  const map = new Map();
  for (const row of expiryAlerts.value || []) {
    const key = `${row.productId}:${row.warehouseId}`;
    const cur = map.get(key);
    if (!cur || (row.expiryDate && (!cur.nearestExpiry || row.expiryDate < cur.nearestExpiry))) {
      map.set(key, row);
    }
  }
  return map;
});

const expiryInfoOf = (p) =>
  expiryByProductWarehouse.value.get(`${p.id}:${inventoryStore.selectedWarehouseId || ''}`) || null;
const nearestExpiryOf = (p) => expiryInfoOf(p)?.expiryDate || null;
const expiryStatusOf = (p) => {
  if (!p?.tracksExpiry) return 'بدون تاريخ انتهاء';
  const status = expiryInfoOf(p)?.status;
  if (!status) return 'صالح';
  if (
    status === 'ينتهي خلال 7 أيام' ||
    status === 'ينتهي خلال 30 يوم' ||
    status === 'ينتهي خلال 60 يوم'
  )
    return 'ينتهي قريباً';
  if (status === 'منتهي') return 'منتهي';
  return 'صالح';
};
const expiryColor = (status) => {
  if (status === 'منتهي') return 'error';
  if (status === 'ينتهي قريباً') return 'warning';
  if (status === 'بدون تاريخ انتهاء') return 'grey';
  return 'success';
};

const categoriesWithCounts = computed(() => {
  const counts = new Map();
  for (const p of products.value) {
    if (p.categoryId == null) continue;
    counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
  }
  return categories.value
    .map((c) => ({ ...c, count: counts.get(c.id) || 0 }))
    .filter((c) => c.count > 0);
});

// Category select options: an explicit "الكل" entry (value null) plus every
// non-empty category with its live product count.
const categoryOptions = computed(() => [
  { title: 'كل التصنيفات', value: null },
  ...categoriesWithCounts.value.map((c) => ({ title: `${c.name} (${c.count})`, value: c.id })),
]);

// ── Payment derivations ────────────────────────────────────────────────────
const changeAmount = computed(() => (change.value > 0 ? change.value : remaining.value));
const changeLabel = computed(() => {
  if (change.value > 0) return 'الباقي';
  if (remaining.value > 0) return 'المستحق';
  return 'التعادل';
});
const changeIcon = computed(() => {
  if (change.value > 0) return 'mdi-cash-refund';
  if (remaining.value > 0) return 'mdi-alert-circle-outline';
  return 'mdi-check-circle-outline';
});
const changeStateClass = computed(() => {
  if (change.value > 0) return 'is-success';
  if (remaining.value > 0) return 'is-error';
  if (payment.paidAmount > 0) return 'is-neutral';
  return '';
});

// ── Formatting ─────────────────────────────────────────────────────────────
// Currency formatting is centralized in '@/utils/formatters' (imported above
// as formatMoney). All call sites pass the relevant currency explicitly.

// Compact label for quick-add chips (e.g., 1k, 10k, 1M).
const shortAmount = (a) => {
  if (a >= 1_000_000) return `${a / 1_000_000}M`;
  if (a >= 1_000) return `${a / 1_000}k`;
  return String(a);
};

// ── Data load ──────────────────────────────────────────────────────────────
const loadProducts = async () => {
  loadingProducts.value = true;
  try {
    const response = await productStore.fetch({
      limit: 1000,
      warehouseId: inventoryStore.selectedWarehouseId || undefined,
    });
    products.value = response?.data || [];
    try {
      expiryAlerts.value =
        (await inventoryStore.fetchExpiryAlerts({
          warehouseId: inventoryStore.selectedWarehouseId || undefined,
        })) || [];
    } catch {
      expiryAlerts.value = [];
    }
  } finally {
    loadingProducts.value = false;
  }
};

const loadCategories = async () => {
  try {
    const response = await categoryStore.fetchCategories();
    categories.value = response?.data || [];
  } catch {
    categories.value = [];
  }
};

watch(() => inventoryStore.selectedWarehouseId, loadProducts);

// ── Cart interactions ──────────────────────────────────────────────────────
const addProduct = (product) => {
  // Services bypass every stock/expiry gate — they have no inventory.
  if (isService(product)) {
    addItem(product);
    return;
  }
  if (expiryStatusOf(product) === 'منتهي') {
    notify.warning('لا توجد كمية صالحة للبيع لهذا المنتج');
    return;
  }
  if (availableOf(product) <= 0) return;
  addItem(product);
};

const cartExpiryWarning = (item) => {
  const p = products.value.find((x) => x.id === item.id || x.id === item.productId);
  if (!p) return '';
  const status = expiryStatusOf(p);
  if (status === 'ينتهي قريباً') return 'ينتهي قريباً — تحقق من الصلاحية قبل البيع';
  if (status === 'منتهي') return 'الكمية الصالحة للبيع غير كافية';
  return '';
};

const commitQty = (id, raw) => {
  updateQty(id, raw);
};

// Reset the unified field and re-focus it, ready for the next scan/search.
const resetSearch = () => {
  searchInput.value = '';
  debouncedSearch.value = '';
  clearTimeout(searchTimer);
  nextTick(() => searchRef.value?.focus?.());
};

// Unified search + barcode entry (one field). Pressing Enter:
//   1) resolves an exact barcode / SKU — including per-unit barcodes so that
//      scanning a carton auto-selects the carton unit (legacy barcode flow);
//   2) otherwise, if the live filter narrowed to a single product, adds it;
//   3) otherwise, if nothing matched at all, tells the cashier the code is
//      unknown. A term that matches many products simply stays as a filter.
const onSearchEnter = () => {
  const code = (searchInput.value || '').trim();
  if (!code) return;

  // 1) Exact barcode / SKU (product- or unit-level). Reads `products` directly
  //    so a fast scanner never waits on the debounced text filter.
  let unitMatch = null;
  const productByUnitBarcode = products.value.find((p) => {
    const unit = (p.units || []).find((u) => u.barcode && u.barcode === code);
    if (unit) {
      unitMatch = unit;
      return true;
    }
    return false;
  });
  const exact =
    productByUnitBarcode || products.value.find((p) => p.barcode === code || p.sku === code);
  if (exact) {
    addItem(exact, 1, unitMatch || null);
    resetSearch();
    return;
  }

  // 2) Live text match — recomputed here (not via the debounced computed) so
  //    Enter is correct even immediately after the last keystroke.
  const q = code.toLowerCase();
  const base = hideExpired.value
    ? products.value.filter((p) => expiryStatusOf(p) !== 'منتهي')
    : products.value;
  const matches = base.filter((p) => {
    if (selectedCategory.value != null && p.categoryId !== selectedCategory.value) return false;
    return productMatchesTerm(p, q);
  });

  if (matches.length === 1) {
    addProduct(matches[0]);
    resetSearch();
    return;
  }

  // 3) Unknown code with no matches — most likely a scan of an absent product.
  if (matches.length === 0) {
    notify.error('لا يوجد منتج بهذا الرمز');
  }
};

const openLineEdit = (item) => {
  lineEditItem.value = item;
  lineEditDraft.discount = Number(item.discount) || 0;
  lineEditDraft.note = String(item.note || '');
  lineEditOpen.value = true;
};

const saveLineEdit = () => {
  const item = lineEditItem.value;
  if (!item) return;
  updateLineDiscount(item.id, lineEditDraft.discount);
  updateLineNote(item.id, lineEditDraft.note);
  lineEditOpen.value = false;
};

// Resolve the new sale's id from whatever shape the API/store hands back so a
// renamed field (id / saleId / invoiceId, or an extra {sale|data} wrapper) can
// never silently break the redirect.
const resolveSaleId = (sale) =>
  sale?.id ?? sale?.saleId ?? sale?.invoiceId ?? sale?.sale?.id ?? sale?.data?.id ?? null;

// Navigate without ever leaking an unhandled rejection: a redundant/aborted
// navigation (NavigationFailure) is benign, anything else is logged + toasted
// while the app stays interactive (no silent freeze on the way to the invoice).
const safePushToSale = async (saleId) => {
  try {
    console.log('[POS] navigating to SaleDetails with id:', saleId);
    await router.push({ name: 'SaleDetails', params: { id: String(saleId) } });
  } catch (err) {
    if (isNavigationFailure(err)) return; // duplicated / aborted — not a real error
    console.error('[POS] navigation to SaleDetails failed:', err);
    notify.error('تم حفظ البيع، لكن تعذّر فتح صفحة الفاتورة');
  }
};

const checkout = async () => {
  // Re-entrancy guard: a double click / repeated F9 must not fire two sales.
  if (submitting.value) return;
  if (!canSubmit.value) return;
  // No usable open accounting period → block the sale (backend rejects too) and
  // point the cashier at opening a period. This is the root container check.
  if (!ensureActivePeriodOrWarn()) return;

  // 1) Persist the sale. `submit()` owns the `submitting` flag (set true here,
  //    reset in its own finally), so the button never stays stuck on failure.
  let sale = null;
  try {
    console.log('[POS] checkout → submitting sale');
    sale = await submit();
    console.log('[POS] checkout → sale API response:', sale);
  } catch (err) {
    // Hard failure (network / validation / server) — nothing was created. Keep
    // the cart intact so the cashier can retry, and stay on the POS screen.
    console.error('[POS] checkout → submit failed:', err);
    notify.error(err?.message || 'فشل إتمام البيع');
    return;
  }

  // `submit()` returns null when it bailed client-side (e.g. blocked) — no sale
  // was created, so leave POS state untouched.
  if (!sale) return;

  // 2) The sale SUCCEEDED. From here every step is isolated so a failure in one
  //    (draft cleanup, navigation) can't abort the others or wedge the screen.
  if (currentDraftId.value) {
    try {
      await saleStore.removeSale(currentDraftId.value);
    } catch (e) {
      console.error('[POS] failed to clean up resumed draft (non-fatal):', e);
    }
    currentDraftId.value = null;
  }

  const saleId = resolveSaleId(sale);
  console.log('[POS] checkout → resolved saleId:', saleId);

  // 3) Reset sensitive POS state ONLY now that the sale is confirmed saved.
  notify.success('تم حفظ البيع بنجاح');
  clear(); // cart + customer + notes + discount + tax + payment method/amount
  paidInput.value = '';
  cartOpen.value = false;

  // 4) Navigate only with a valid id. If none came back, the sale is still
  //    safe (it's in the list) — keep the app usable instead of pushing to a
  //    broken /sales/undefined route.
  if (saleId == null) {
    console.warn('[POS] sale saved but no id resolved — staying on POS');
    return;
  }
  console.log('[POS] checkout → navigating to SaleDetails', saleId);
  await safePushToSale(saleId);
};

const onHold = async () => {
  if (submitting.value) return; // don't fork a second draft on a double click
  // Holding an invoice is a write inside the period — gate it the same way.
  if (!ensureActivePeriodOrWarn()) return;
  try {
    // Resuming an existing draft? Drop the old row first so we don't fork it
    // into two competing drafts when the cashier saves again.
    if (currentDraftId.value) {
      try {
        await saleStore.removeSale(currentDraftId.value);
      } catch (e) {
        console.error('Failed to remove previous draft:', e);
      }
      currentDraftId.value = null;
    }
    const draft = await holdAsDraft();
    if (draft) {
      notify.success('تم حفظ المسودة');
      clear();
      paidInput.value = '';
      cartOpen.value = false;
    }
  } catch (err) {
    notify.error(err?.message || 'فشل حفظ المسودة');
  }
};

const confirmClear = () => {
  clearDialog.value = true;
};

// ── Drafts list ──────────────────────────────────────────────────────────
// Display only cash/POS drafts. Installment drafts stay in NewSale.vue.
// Listing endpoint already enforces branch scope server-side, so we do not
// need to refilter by branch in the client.
const isPosCompatibleDraft = (d) => {
  if (!d || d.status !== 'draft') return false;
  const pt = String(d.paymentType || '').toLowerCase();
  return pt === '' || pt === 'cash';
};

const loadDrafts = async () => {
  if (!canUseDrafts.value) return;
  draftsLoading.value = true;
  draftsError.value = '';
  try {
    // Hit the API directly — the saleStore.fetch helper would clobber the
    // shared `sales` cache and surface a toast that we already render inline.
    const response = await api.get('/sales', {
      params: { status: 'draft', paymentType: 'cash', limit: 100 },
    });
    const rows = response?.data || [];
    // Defensive: re-filter client-side in case the backend returns
    // mixed/installment drafts (older data, race with API change, etc.).
    draftList.value = rows.filter(isPosCompatibleDraft);
  } catch (err) {
    // The axios interceptor rejects with either the response body or the
    // original error, so check both shapes for a usable message.
    console.error('Failed to load drafts:', err);
    draftsError.value = err?.message || err?.response?.data?.message || 'فشل تحميل المسودات';
    draftList.value = [];
  } finally {
    draftsLoading.value = false;
  }
};

const openDraftsList = () => {
  draftsOpen.value = true;
  loadDrafts();
};

const filteredDrafts = computed(() => {
  const q = (draftsSearch.value || '').trim().toLowerCase();
  if (!q) return draftList.value;
  return draftList.value.filter((d) => {
    const inv = String(d.invoiceNumber || '').toLowerCase();
    const cus = String(d.customer || '').toLowerCase();
    return inv.includes(q) || cus.includes(q);
  });
});

const formatDraftDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Hydrate the cart from a draft already loaded in the list. Mirrors the
// route-driven `hydrateFromDraft`, but works in-place from the modal so the
// cashier can switch drafts without leaving the screen.
const applyDraftToCart = async (draftRow) => {
  continuingDraftId.value = draftRow.id;
  try {
    const response = await saleStore.fetchSale(draftRow.id);
    const draft = response?.data?.data || response?.data || response || null;
    if (!draft || draft.status !== 'draft') {
      notify.error('المسودة غير صالحة');
      return;
    }
    if (!isPosCompatibleDraft(draft)) {
      // Installment / non-cash drafts must be edited in NewSale.
      notify.warning('هذه المسودة بالأقساط — تابعها من شاشة بيع جديد');
      return;
    }
    // Restore payment method/reference if available on the draft items list
    // record (paymentMethod is not on the sale row itself but the composable
    // restores cart-level fields; method defaults to 'cash' which matches POS).
    const ok = loadDraft(draft, products.value);
    if (!ok) {
      notify.error('تعذر تحميل المسودة');
      return;
    }
    currentDraftId.value = draft.id;
    paidInput.value = '';
    notify.success('تم تحميل المسودة');
    draftsOpen.value = false;
  } catch (err) {
    console.error('Failed to continue draft:', err);
    notify.error(err?.response?.data?.message || 'فشل تحميل المسودة');
  } finally {
    continuingDraftId.value = null;
  }
};

const continueDraft = (draftRow) => {
  if (!isPosCompatibleDraft(draftRow)) {
    notify.warning('مسودة غير متوافقة مع الـ POS');
    return;
  }
  if (items.length > 0) {
    // Don't silently clobber an in-progress cart — confirm first.
    draftPendingLoad.value = draftRow;
    draftReplaceDialog.value = true;
    return;
  }
  applyDraftToCart(draftRow);
};

const confirmReplaceWithDraft = async () => {
  const target = draftPendingLoad.value;
  draftPendingLoad.value = null;
  if (!target) return;
  // Reset cart state first so loadDraft (which bails on non-empty cart) runs.
  clear();
  paidInput.value = '';
  await applyDraftToCart(target);
};

const askDeleteDraft = (draftRow) => {
  draftPendingDelete.value = draftRow;
  draftDeleteDialog.value = true;
};

const confirmDeleteDraft = async () => {
  const target = draftPendingDelete.value;
  draftPendingDelete.value = null;
  if (!target) return;
  deletingDraftId.value = target.id;
  try {
    await saleStore.removeSale(target.id);
    draftList.value = draftList.value.filter((d) => d.id !== target.id);
    if (currentDraftId.value === target.id) currentDraftId.value = null;
  } catch (err) {
    console.error('Failed to delete draft:', err);
    // saleStore already surfaces a notification for delete failures.
  } finally {
    deletingDraftId.value = null;
  }
};

// ── Keyboard: global shortcuts ─────────────────────────────────────────────
const isEditable = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

const onKeydown = (e) => {
  // F2 / F4 both focus the unified search/barcode field.
  if (e.key === 'F2' || e.key === 'F4') {
    e.preventDefault();
    searchRef.value?.focus?.();
    return;
  }
  if (e.key === 'F9' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
    e.preventDefault();
    checkout();
    return;
  }
  if (isEditable(e.target)) return;
};

// ── Keyboard: grid roving focus ────────────────────────────────────────────
const focusFirstCard = () => {
  const first = gridRef.value?.querySelector('.pos-tile:not(.pos-tile--disabled)');
  if (first) first.focus();
};

const gridCols = () => {
  const grid = gridRef.value;
  if (!grid) return 1;
  const tmpl = getComputedStyle(grid).gridTemplateColumns;
  return Math.max(1, tmpl.split(' ').filter(Boolean).length);
};

const onGridKey = (e) => {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(e.key)) return;

  const cards = Array.from(
    gridRef.value?.querySelectorAll('.pos-tile:not(.pos-tile--disabled)') || []
  );
  if (cards.length === 0) return;

  const current = document.activeElement;
  let idx = cards.indexOf(current);
  if (idx < 0) idx = 0;

  const cols = gridCols();
  let next = idx;

  switch (e.key) {
    case 'ArrowLeft':
      next = idx + 1;
      break;
    case 'ArrowRight':
      next = idx - 1;
      break;
    case 'ArrowDown':
      next = idx + cols;
      break;
    case 'ArrowUp':
      next = idx - cols;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = cards.length - 1;
      break;
  }

  if (next < 0 || next >= cards.length) return;
  e.preventDefault();
  cards[next]?.focus();
};

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(async () => {
  if (inventoryStore.branches.length === 0) await inventoryStore.fetchBranches();
  if (inventoryStore.warehouses.length === 0) await inventoryStore.fetchWarehouses();

  await Promise.all([loadProducts(), loadCategories()]);

  try {
    const settings = await settingsStore.fetchCurrencySettings();
    if (settings?.defaultCurrency) currency.value = settings.defaultCurrency;
  } catch {
    /* keep default */
  }

  await hydrateFromDraft();

  // Selling only needs a usable open accounting period (no shifts).
  await refreshCurrentAccountingPeriod();

  // Poll the open period so that when it auto-closes (its time elapses) the POS
  // blocks selling within ~30s without a reload — the backend reports no open
  // period the instant it expires, and a sale attempt is rejected server-side
  // regardless, so this just keeps the banner/gating in sync.
  if (accountingPeriodsEnabled.value) {
    periodPollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      refreshCurrentAccountingPeriod();
    }, 30000);
  }

  window.addEventListener('keydown', onKeydown);
  nextTick(() => searchRef.value?.focus?.());
});

// Resume a cash/card draft into the POS cart. Installment drafts are routed
// to NewSale, so anything that lands here should be a cash-style draft —
// we still validate to be defensive against stale links.
const hydrateFromDraft = async () => {
  const draftId = route.query.draftId ? Number(route.query.draftId) : null;
  if (!draftId) return;
  if (items.length > 0) return; // never clobber an in-progress cart

  try {
    const response = await saleStore.fetchSale(draftId);
    const draft = response?.data?.data || response?.data || response || null;
    if (!draft || draft.status !== 'draft') {
      notify.error('المسودة غير صالحة');
      return;
    }
    if (draft.paymentType === 'installment') {
      // Wrong screen for this draft — bounce to NewSale instead of mangling it.
      router.replace({ name: 'NewSale', query: { draftId } });
      return;
    }
    const ok = loadDraft(draft, products.value);
    if (ok) {
      currentDraftId.value = draft.id;
      notify.info('تم تحميل المسودة');
    }
  } catch (err) {
    console.error('Failed to load POS draft:', err);
    notify.error('فشل تحميل المسودة');
  }
};

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  clearTimeout(searchTimer);
  clearTimeout(flashTimer);
  if (periodPollTimer) clearInterval(periodPollTimer);
});
</script>

<style scoped lang="scss">
/* ══════════════════ Design tokens (local) ══════════════════ */
.pos {
  --pos-gap: 16px;
  --pos-radius: 16px;
  --pos-border: rgba(var(--v-theme-on-surface), 0.08);
  --pos-soft: rgba(var(--v-theme-on-surface), 0.03);
  --pos-tint: rgba(var(--v-theme-on-surface), 0.06);
  --pos-primary: rgb(var(--v-theme-primary));
  --pos-primary-soft: rgba(var(--v-theme-primary), 0.08);

  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(330px, 31vw, 440px);
  gap: var(--pos-gap);
  height: calc(100dvh - 96px);
  min-height: 560px;
  direction: rtl;
}

/* Tablet: narrow the cart a touch so the catalogue keeps breathing room. */
@media (max-width: 1280px) {
  .pos {
    grid-template-columns: minmax(0, 1fr) 320px;
  }
}

.pos__panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  border: 1px solid var(--pos-border);
  border-radius: var(--pos-radius);
  overflow: hidden;
}

/* ══════════════════ Products panel ══════════════════ */
.pos__products {
  min-height: 0;
}

.pos__toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--pos-border);
  background: rgb(var(--v-theme-surface));
}

.pos__filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.pos__category {
  flex: 1 1 200px;
  min-width: 180px;
}

.pos__tiers {
  flex: 0 0 auto;
  gap: 6px;
}

.pos__expired {
  flex: 0 0 auto;
  margin-inline-start: auto;
}

.pos__search-hint {
  opacity: 0.45;
}

/* Column count is fixed per breakpoint (not auto-fill) so the card size stays
   stable and we hit the intended grid: ~2 (mobile) → 3–4 (tablet) → 5–6
   (desktop). The panel width tracks the viewport (the cart is a fixed-ish
   column / drawer), so viewport breakpoints map cleanly to the catalogue. */
.pos__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr); /* mobile: 2 columns */
  gap: 12px;
  padding: 14px;
  /* Fill the space between the toolbar and the pagination bar; this is the only
     scroll region in the products panel (the pager below stays fixed). */
  flex: 1 1 auto;
  overflow-y: auto;
  align-content: start;
  /* Rows size to the card's own height and never stretch/compress to fill the
     scroll area — so adding more products grows the scroll, never shrinks the
     cards. (Explicitly NOT `1fr`, which would distribute height across rows.) */
  grid-auto-rows: max-content;
  min-height: 0;
  min-width: 0;
  scrollbar-gutter: stable;
}

/* Large phones / small tablets (drawer mode, full width) → 3 columns. */
@media (min-width: 600px) {
  .pos__grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* Tablets → 4 columns (portrait drawer and the md side-by-side band). */
@media (min-width: 768px) {
  .pos__grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* Desktop side-by-side → ~5 columns. */
@media (min-width: 1280px) {
  .pos__grid {
    grid-template-columns: repeat(5, 1fr);
  }
}

/* Wide desktop → 6 columns when the space allows it. */
@media (min-width: 1700px) {
  .pos__grid {
    grid-template-columns: repeat(6, 1fr);
  }
}

.pos__empty {
  grid-column: 1 / -1;
  padding: 48px 16px;
}

/* Pagination bar: pinned below the grid (never scrolls), mirrors the cart's
   footer border so the two panels feel balanced. */
.pos__pager {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 8px 14px;
  border-top: 1px solid var(--pos-border);
  background: rgb(var(--v-theme-surface));
}

.pos__pager--mobile {
  margin-bottom: 45px;
}

.pos__pager-size {
  flex: 0 0 116px;
  max-width: 116px;
}

.pos__pager-count {
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Push the page controls to the inline-end (visual left in RTL). */
.pos__pager-nav {
  margin-inline-start: auto;
  width: auto;
}

/* ══════════════════ Product card ══════════════════ */
/* All cards share one structure (fixed-ratio media + 3-row body) so they line
   up to a perfectly even grid regardless of name length. */
.pos-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  /* Fixed geometry: media (132) + the 3-row body. The min-height guarantees the
     card keeps a clear, consistent size no matter how many products render —
     the grid scrolls, the cards never shrink. */
  min-height: 236px;
  border: 1px solid var(--pos-border);
  background: rgb(var(--v-theme-surface));
  cursor: pointer;
  overflow: hidden;
  transition:
    transform 0.1s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;

  &:hover:not(.pos-tile--disabled) {
    transform: translateY(-3px);
    border-color: var(--pos-primary);
    box-shadow: 0 8px 22px rgba(var(--v-theme-primary), 0.18);
  }

  &:hover:not(.pos-tile--disabled) .pos-tile__add {
    opacity: 1;
    transform: scale(1);
  }

  &:focus-visible {
    outline: 2px solid var(--pos-primary);
    outline-offset: 2px;
  }

  /* Out-of-stock / expired products stay visible but clearly dimmed and
     de-saturated, and can't be added (pointer-events off). The "نفذ" status
     badge keeps reading at full strength on top of the muted media. */
  &--disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;

    .pos-tile__media,
    .pos-tile__body {
      filter: grayscale(0.55);
    }
  }
}

/* ── Media ── */
/* Fixed image height (within the 120–150px target) keeps every card the same
   height regardless of how wide the column is at the current breakpoint. */
.pos-tile__media {
  position: relative;
  /* flex: 0 0 132px locks the media band's height in the column — it can neither
     grow nor shrink, so the image area is identical on every card. */
  flex: 0 0 132px;
  height: 132px;
  width: 100%;
  background: var(--pos-tint);
}

.pos-tile__img {
  width: 100%;
  height: 100%;
}

.pos-tile__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--ph-from, #6a6a72), var(--ph-to, #44444c));
}

.pos-tile__placeholder-icon {
  position: absolute;
  color: rgba(255, 255, 255, 0.22);
}

.pos-tile__initials {
  position: relative;
  font-size: 1.4rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.pos-tile__status {
  position: absolute;
  top: 6px;
  inset-inline-start: 6px;
  font-weight: 700;
}

.pos-tile__star {
  position: absolute;
  top: 6px;
  inset-inline-end: 6px;
  color: rgb(var(--v-theme-warning));
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
}

.pos-tile__expiry {
  position: absolute;
  bottom: 6px;
  inset-inline-start: 6px;
  font-weight: 700;
}

.pos-tile__add {
  position: absolute;
  bottom: 6px;
  inset-inline-end: 6px;
  opacity: 1;
  transform: scale(1);
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);

  /* On hover-capable screens the (+) reveals on hover to keep the media clean;
     on touch it stays visible since there's no hover. */
  @media (hover: hover) {
    opacity: 0;
    transform: scale(0.7);
  }
}

/* ── Body ── */
.pos-tile__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px 10px;
  width: 100%;
  /* Take the space left under the fixed media band and allow inner clamping. */
  flex: 1 1 auto;
  min-height: 0;
}

.pos-tile__name {
  font-weight: 600;
  font-size: 0.86rem;
  line-height: 1.3;
  /* Reserve exactly two lines so every card is the same height. */
  min-height: 2.24em;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.pos-tile__sku {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pos-tile__foot {
  /* Pin price + stock to the bottom so they line up across every card. */
  margin-top: auto;
  padding-top: 2px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.pos-tile__price {
  font-weight: 800;
  font-size: 1.04rem;
  color: var(--pos-primary);
  font-variant-numeric: tabular-nums;
}

.pos-tile__count {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.74rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-variant-numeric: tabular-nums;
}

/* ── Skeleton (matches the card silhouette) ── */
.pos-tile--skeleton {
  pointer-events: none;
}

.sk-shimmer {
  background: linear-gradient(90deg, var(--pos-soft) 0%, var(--pos-tint) 50%, var(--pos-soft) 100%);
  background-size: 200% 100%;
  animation: pos-shimmer 1.4s infinite ease-in-out;
}

.sk-line {
  height: 11px;
  border-radius: 6px;
  margin-bottom: 6px;

  &--short {
    width: 55%;
  }
  &--price {
    width: 40%;
    height: 16px;
    margin-top: 4px;
  }
}

@keyframes pos-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

/* ══════════════════ Cart panel ══════════════════ */
.pos__cart {
  background: rgb(var(--v-theme-surface));
}

.cart__handle {
  display: flex;
  justify-content: center;
  padding: 8px 0 4px;
  cursor: pointer;
}

.cart__handle-bar {
  width: 42px;
  height: 4px;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.25);
}

.cart__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  flex-shrink: 0;
}

.cart__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.cart__title-text {
  font-size: 1.02rem;
  font-weight: 800;
}

.cart__header-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

/* ── Lines ── */
.cart__lines {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 8px;
}

.cart__lines-inner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
}

.cart__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 24px;
}

.cart__hints {
  display: flex;
  gap: 10px;
  margin-top: 14px;

  @media (pointer: coarse) {
    display: none;
  }

  kbd {
    font-family: inherit;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
}

.line {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;

  &--flash {
    animation: line-flash 0.9s ease-out;
  }

  &--skeleton {
    min-height: 76px;
    background: linear-gradient(
      90deg,
      var(--pos-soft) 0%,
      var(--pos-tint) 50%,
      var(--pos-soft) 100%
    );
    background-size: 200% 100%;
    animation: pos-shimmer 1.4s infinite ease-in-out;
  }
}

@keyframes line-flash {
  0% {
    box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.5) inset;
  }
  100% {
    box-shadow: 0 0 0 0 transparent inset;
  }
}

.line__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.line__name {
  font-weight: 700;
  font-size: 0.92rem;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  color: rgb(var(--v-theme-on-surface));
}

.line__actions {
  display: inline-flex;
  gap: 2px;
  flex-shrink: 0;
}

.line__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.75);
}

.line__unit-price {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.line__sep {
  opacity: 0.4;
}

.line__unit-btn {
  height: 22px !important;
}

.line__warn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  color: rgb(var(--v-theme-warning));
}

.line__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
  color: rgba(var(--v-theme-on-surface), 0.85);
}

.line__qty {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.line__qty-input {
  width: 64px;

  :deep(input) {
    text-align: center;
    font-variant-numeric: tabular-nums;
    -moz-appearance: textfield;
  }
}

.line__total {
  font-weight: 800;
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}

/* ══════════════════ Pay / footer ══════════════════ */
.cart__pay {
  flex-shrink: 0;
  padding: 12px;
  border-top: 1px solid var(--pos-border);
  background: rgb(var(--v-theme-surface));
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pay__breakdown {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.82rem;
  color: rgba(var(--v-theme-on-surface), 0.75);
}

.pay__row {
  display: flex;
  justify-content: space-between;
  font-variant-numeric: tabular-nums;

  &--warning {
    color: rgb(var(--v-theme-warning));
  }
}

.pay__total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 6px 12px;
  border-radius: 12px;
  background: var(--pos-primary-soft);
}

.pay__total-label {
  font-weight: 700;
}

.pay__total-value {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--pos-primary);
  font-variant-numeric: tabular-nums;
}

.pay__expander {
  :deep(.v-expansion-panel) {
    background: var(--pos-soft);
  }
  :deep(.v-expansion-panel-title) {
    min-height: 40px;
    font-size: 0.82rem;
    padding: 8px 12px;
  }
  :deep(.v-expansion-panel-text__wrapper) {
    padding: 8px 12px 12px;
  }
}

.pay__adjust {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pay__methods {
  width: 100%;
  gap: 8px;

  :deep(.v-btn) {
    flex: 1;
  }
}

.pay__readout {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--pos-tint);
  border: 1px solid transparent;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;

  &.is-success {
    background: rgba(var(--v-theme-success), 0.1);
    border-color: rgba(var(--v-theme-success), 0.4);
  }
  &.is-error {
    background: rgba(var(--v-theme-error), 0.08);
    border-color: rgba(var(--v-theme-error), 0.35);
  }
}

.pay__readout-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-variant-numeric: tabular-nums;

  &--delta {
    font-weight: 700;
  }
}

.pay__readout-label {
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 0.82rem;
}

.pay__readout-typed {
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.pay__readout-amount {
  margin-inline-start: auto;
  font-weight: 700;
}

.numpad__quick {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(56px, 1fr));
  gap: 6px;
  margin-bottom: 8px;
}

.numpad__keys {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.pay__utils {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

.pay__actions {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: stretch;
}

.pay__draft-wrap {
  display: inline-flex;
}

.pay__checkout {
  position: relative;
}

.pay__hotkey {
  position: absolute;
  inset-inline-end: 8px;
  bottom: 4px;
  font-size: 0.6rem;
  opacity: 0.7;
}

/* ── List transitions ── */
.line-anim-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.line-anim-enter-active {
  transition:
    opacity 0.18s ease-out,
    transform 0.18s ease-out;
}
.line-anim-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
  position: absolute;
  inset-inline: 0;
}
.line-anim-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
.line-anim-move {
  transition: transform 0.18s ease;
}

/* ── Drafts dialog ── */
.drafts__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px 16px;
}

.drafts__item {
  border: 1px solid var(--pos-border);
  background: var(--pos-soft);
}

/* ══════════════════ Responsive: drawer mode ══════════════════ */
.pos--drawer {
  display: block;
  height: auto;
  min-height: 0;
}

.pos--drawer .pos__products {
  height: calc(100dvh - 96px);
  min-height: 420px;
}

.pos--drawer .pos__cart {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(94vw, 420px);
  border-radius: 0;
  z-index: 2400;
  transform: translateX(100%);
  transition: transform 0.26s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: -8px 0 30px rgba(0, 0, 0, 0.35);

  &.is-open {
    transform: translateX(0);
  }
}

.pos__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 2300;
}

.pos__bottombar {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 2200;
  padding: 10px 14px;
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid var(--pos-border);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.18);
}

.pos__bottombar-cart {
  font-variant-numeric: tabular-nums;
}

/* Phones: tighter two-column grid, leave room for the bottom bar. */
@media (max-width: 600px) {
  .pos--drawer .pos__products {
    height: calc(100dvh - 168px);
  }
  /* Keep the base 2-column grid; just tighten spacing and the media height. */
  .pos__grid {
    gap: 8px;
    padding: 10px;
  }
  /* Shorter card on phones, but still a locked size — never collapses. */
  .pos-tile {
    min-height: 212px;
  }
  .pos-tile__media {
    flex-basis: 116px;
    height: 116px;
  }
  .pos-tile__add {
    opacity: 1;
    transform: scale(1);
  }
  .pos__expired {
    margin-inline-start: 0;
  }
}
</style>
