"""Build assets/js/troogrowth-lib.js: buyer questions per category (from the Troopod Category Barrier Library),
detectors that look for answers in page text, sub-category keywords, and fix text. Edit this file, not the output."""
import json, re

L = json.load(open('lib.json'))  # the barrier library tabs exported from Troopod_Category_Barrier_Library.xlsx (kept out of the repo)
TAB = {
    "Jewellery & Accessories": "Jewellery + Accessories", "Fashion & Apparel": "Fashion + Apparel", "Beauty & Personal Care": "Beauty + Personal Care",
    "Health & Wellness": "Health + Wellness", "Food & Beverages": "Food + Beverages", "Home & Living": "Home + Living",
    "Electronics & Gadgets": "Electronics + Gadgets", "Baby & Kids": "Baby + Kids", "Pet Care": "Pet Care", "Sports & Fitness": "Sports + Fitness",
}
QK = 'Customer Question (the doubt in their head)'

def voice(q):
    q = q.strip()
    q = re.sub(r"^Can the buyer see exactly what they'll get\?", "Can I see exactly what I'll get?", q)
    q = q.replace("the buyer", "I").replace("they'll", "I'll").replace("Do other people endorse this?", "Do other people vouch for this?")
    q = re.sub(r"\s*\(.*$", "", q).strip()
    q = re.sub(r"\b([A-Z]{3,})\b", lambda m: m.group(1).lower() if m.group(1) not in ("UPI", "COD", "EMI", "FSSAI", "GMP", "BPA") else m.group(1), q)
    q = q.replace(" — ", ", ").replace("—", ", ")
    q = {"Returning the wrong size will be a hassle.": "Will returning the wrong size be a hassle?", "Returning the wrong size or item will be a hassle.": "Will returning the wrong size be a hassle?"}.get(q, q)
    if not q.endswith("?") and not q.endswith("."): q += "?"
    return q
def tidy_good(g):
    g = re.sub(r"\s*\((?:Baymard|MECLABS|LIFT|NN/g|CXL|Nielsen)[^)]*\)?.*$", "", g.strip())
    g = re.sub(r"\s*\([^)]*$", "", g)
    return g.rstrip(" ;,").replace(" — ", ": ").replace("—", ", ")
PRI = {"HIGH": "must", "MEDIUM": "should", "BASELINE": "basic"}

cats = {}
for cat, tab in TAB.items():
    rows = []
    for r in L[tab]:
        bid = r['Barrier ID'].strip()
        if not re.match(r'^B\d\d$', bid): continue
        rows.append({"id": bid, "n": r['Barrier Name'].strip(), "q": voice(r[QK]), "w": int(float(r['Weight (1-10)'] or 5)), "p": PRI.get(r['Priority'].strip().upper(), "basic"),
                     "good": tidy_good(r['What Good Looks Like']), "rc": r['Root Cause'].strip()})
    cats[cat] = rows
# Games & Toys and Other: universal tab + the category's own barriers from the flat list
uni = []
for r in L['Universal Barriers']:
    bid = r['Barrier ID'].strip()
    if not re.match(r'^B\d\d$', bid): continue
    uni.append({"id": bid, "n": r['Barrier Name'].strip(), "q": voice(r[QK]), "w": int(float(r['Weight (1-10)'] or 5)), "p": PRI.get(r['Priority'].strip().upper(), "basic"), "good": tidy_good(r['What Good Looks Like']), "rc": r['Root Cause'].strip()})
cats["Other"] = uni
GT = {"B73": ("Will we actually get to play it?", 7), "B74": ("Is this the right tier or standard for how I'll use it?", 8), "B75": ("Will we play this more than once?", 6),
      "B76": ("Will pieces be missing or flimsy?", 8), "B77": ("Is this genuine, not a copy?", 9), "B78": ("Am I paying a fair price for this exact edition?", 8), "B79": ("Which listing is the one I actually want?", 7)}
GT_GOOD = {"B73": "Player count, play time, age and a short how-to-play video near the price.", "B74": "Exact dimensions, standard or tier (tournament, club, travel), and who it is for.",
           "B75": "Replay value: variations, expansions, modes, and reviews about repeat play.", "B76": "What's in the box, component material close-ups, and a missing-piece replacement promise.",
           "B77": "Licence or authenticity proof, official seller badge, and provenance details.", "B78": "Edition, grade and print-run details with a clear price basis.", "B79": "One clear listing per edition with a comparison of versions."}
gt = [dict(x) for x in uni]
w_over = {"B19": 9, "B09": 8, "B08": 8, "B04": 8, "B01": 8, "B13": 8, "B15": 7, "B18": 7, "B12": 7, "B03": 7}
for x in gt:
    if x["id"] in w_over: x["w"] = w_over[x["id"]]; x["p"] = "must" if x["w"] >= 8 else "should"
for bid, (q, w) in GT.items():
    gt.append({"id": bid, "n": q, "q": q, "w": w, "p": "must" if w >= 8 else ("should" if w >= 6 else "basic"), "good": GT_GOOD[bid], "rc": "Clarity failure"})
cats["Games & Toys"] = gt

# ---------------------------------------------------------------- detectors: [label, regex]; all case-insensitive, matched on page text
D = {
 "B01": [["product video", r"\b(product video|watch (?:how|it|the video)|video)\b"], ["zoom or close-up", r"\b(zoom|360|close[- ]?up|macro shot)\b"], ["texture or swatch", r"\b(swatch(?:es)?|texture shot|shade card)\b"],
         ["real-life photos", r"\b(real (?:customer )?photos?|on[- ]model|model is wearing|customer photos)\b"], ["what's in the box", r"\b(what'?s in the box|in the box|box contents|pack contains|you will receive)\b"]],
 "B02": [["who it's for", r"\b(suitable for|ideal for|perfect for|best for|recommended for|who (?:is it|it'?s) for|made for)\b"], ["size or fit guide", r"\b(size (?:guide|chart)|find your (?:size|fit)|fit guide|measurements?)\b"],
         ["type or need filter", r"\b(skin type|hair type|for (?:all|oily|dry|sensitive|combination|normal) (?:skin|hair)|body type)\b"], ["quiz or matcher", r"\b(take (?:the|our) quiz|find your (?:match|routine)|personali[sz]ed (?:for you|recommendation))\b"]],
 "B03": [["results timeline", r"\b(?:results?|visible|see|notice|difference|improve\w*|reduc\w*|works?)\b[^.]{0,40}\b(?:in|within|after) \d{1,2} (?:days|weeks|uses)\b"], ["before and after", r"\bbefore\s*(?:&|and|/)\s*after\b"],
         ["benefits explained", r"\b(key benefits|benefits|how it (?:works|helps)|what it does)\b"], ["measured results", r"\b(clinically|\d{2,3}% (?:of (?:users|people|customers) )?(?:saw|reported|felt|noticed|agreed)|tested on \d+)\b"]],
 "B04": [["brand story", r"\b(founded|founder|our story|since (?:19|20)\d\d|est\.? (?:19|20)\d\d)\b"], ["certifications", r"\b(certified|certification|iso \d|gmp|fssai|fda|bis hallmark|hallmarked|dermatologist|lab[- ]tested|cruelty[- ]free|peta)\b"],
         ["press mentions", r"\b(as seen (?:in|on)|featured in|in the news)\b"], ["customer count", r"\b\d+(?:\.\d+)?\s?(?:k|l|lakh|million|mn|m|cr|crore)\+?\s+(?:happy |satisfied )?(?:customers|users|orders|families|buyers)\b"],
         ["maker details", r"\b(marketed by|manufactured by|registered office|country of origin)\b"]],
 "B05": [["original price shown", r"\b(mrp|m\.r\.p|regular price|you save|save (?:rs\.?|₹|\$)\s?\d+|\d{1,2}% off)\b"], ["taxes included", r"\b(inclusive of all taxes|incl\.? (?:of )?(?:all )?taxes|tax(?:es)? included)\b"],
         ["price per use", r"\b(per (?:serving|unit|day|wear|use|ml|gram|capsule|tablet)|₹\s?\d+\s?/\s?(?:day|serving|ml|g|use))\b"], ["pay later or EMI", r"\b(no[- ]cost emi|emi|pay in \d|snapmint|simpl|klarna|afterpay|affirm)\b"], ["value pack", r"\b(combo|bundle|value pack|pack of \d|kit)\b"]],
 "B06": [["store option", r"\b(store locator|find a store|visit (?:our|a) store|our stores|offline stores?)\b"], ["online-only value", r"\b(online exclusive|only online|exclusively online|web exclusive)\b"], ["talk to an expert", r"\b(video call|book a (?:consultation|call|demo)|try at home|home try)\b"]],
 "B07": [["comparison", r"\b(compare|comparison|versus|unlike (?:other|regular|ordinary)|why choose|what makes (?:us|it) different|better than|vs\.? (?:others|regular))\b"]],
 "B08": [["return window", r"\b\d{1,3}[- ]?days? (?:easy |free |hassle[- ]free )?(?:returns?|exchanges?|replacement|money[- ]back)\b"], ["easy returns", r"\b(easy|free|hassle[- ]free) (?:returns?|exchanges?)\b"],
         ["guarantee", r"\b(money[- ]back|guarantee|warranty)\b"], ["returns policy", r"\b(return (?:&|and) (?:exchange|refund)|returns? policy|refund policy)\b"]],
 "B09": [["delivery date check", r"\b(check (?:delivery|pincode|pin code|availability)|enter (?:your )?(?:pincode|pin code|zip)|delivery by|get it by|delivered (?:in|within|by)|dispatch(?:ed)? (?:in|within)|ships? (?:in|within))\b"],
         ["delivery time", r"\b\d{1,2}\s?(?:-|–|to)\s?\d{1,2} (?:business |working )?days\b"], ["free delivery", r"\bfree (?:shipping|delivery)\b"], ["order tracking", r"\b(track (?:your )?order|order tracking)\b"]],
 "B10": [["cash on delivery", r"\b(cash on delivery|cod available|pay on delivery)\b"], ["payment options", r"\b(upi|gpay|google pay|phonepe|paytm|visa|mastercard|rupay|credit card|debit card|net ?banking|apple pay|shop pay|paypal)\b"],
         ["secure payment", r"\b(secure (?:payment|checkout)|100% secure|ssl|encrypted)\b"]],
 "B11": [["how to use", r"\b(how to (?:use|apply|wear|take|wash|care|make|prepare|brew|install|set ?up)|directions|instructions|dosage|care (?:guide|instructions)|step \d)\b"]],
 "B12": [["ingredients or materials", r"\b(ingredients|full ingredient list|composition|made (?:with|from))\b"], ["free-from list", r"\b(free (?:from|of)|non[- ]toxic|paraben[- ]free|sulfate[- ]free|bpa[- ]free|nickel[- ]free|hypoallergenic|no (?:added|artificial|harmful))\b"],
         ["safety testing", r"\b(safety tested|dermatologically tested|lab[- ]tested|clinically tested|safe for (?:daily|kids|pregnan|all))\b"], ["side-effect info", r"\b(side[- ]effects?|allergen|consult (?:your|a) doctor)\b"]],
 "B13": [["star rating", r"(\b[1-5]\.\d\s?(?:/\s?5|out of 5|stars?)|★{4,}|\b[1-9][\d,.]*\+?\s?k?\+?\s(?:verified )?(?:reviews|ratings)\b)"], ["customer reviews", r"\b(customer reviews|verified (?:buyer|purchase|review)|what (?:our )?customers (?:say|are saying)|testimonials?)\b"],
         ["experts or creators", r"\b(loved by|recommended by|expert(?:s)? (?:approved|recommended)|creators?)\b"]],
 "B14": [["warranty", r"\b(\d+[- ](?:year|month)s? warranty|warranty|lifetime (?:service|warranty|exchange))\b"], ["support contact", r"\b(customer (?:care|support|service)|contact us|whatsapp us|call us|helpline|chat with us|support@|care@|help@)\b"],
         ["care and repair", r"\b(care instructions|how to care|maintenance|repair)\b"]],
 "B15": [["variant help", r"\b(which (?:one|size|shade|variant|pack) is right|choose (?:your|the right)|find your (?:shade|size|fit)|compare (?:variants|sizes|models))\b"], ["popular pick", r"\b(most popular|best ?seller|recommended|best value)\b"]],
 "B16": [["privacy policy", r"\bprivacy policy\b"], ["data promise", r"\b(we (?:never|don'?t) (?:share|sell)|your data is safe|secure(?:ly)? stored)\b"]],
 "B17": [["diet or values labels", r"\b(vegan|vegetarian|100% veg|green dot|halal|jain|gluten[- ]free|cruelty[- ]free|sugar[- ]free|lactose[- ]free|kosher|plant[- ]based|ethically made|sustainable)\b"]],
 "B18": [["share or save", r"\b(share (?:on|via|this)|send to|wishlist|save for later|add to wishlist)\b"]],
 "B19": [["gift options", r"\b(gift (?:wrap|box|card|message|note|set|hamper|packaging)|gifting|perfect gift|gift (?:for|ideas))\b"]],
 "B66": [["reason to act now", r"\b(ends (?:in|tonight|today|soon)|limited (?:time|stock|edition|period)|only [1-9]\d? left|sale ends|last chance|while stocks? last|till stocks? last)\b"]],
 "B69": [["shipping cost shown", r"\b(free (?:shipping|delivery) (?:on|for|above|over)[^.]{0,30}\d|shipping (?:charges?|fee|cost)|delivery (?:charges?|fee)|no hidden (?:charges|fees|costs))\b"], ["taxes included", r"\b(inclusive of all taxes|incl\.? (?:of )?(?:all )?taxes|tax(?:es)? included)\b"]],
 "B71": [["secure checkout", r"\b(secure (?:payment|checkout)|100% secure|safe (?:&|and) secure|ssl|encrypted|pci)\b"], ["payment logos", r"\b(visa|mastercard|rupay|amex|paypal|upi)\b"]],
 "B72": [["cancel anytime", r"\b(cancel (?:anytime|any time)|pause (?:or|and) (?:skip|cancel)|skip a (?:delivery|month)|no commitment|modify or cancel)\b"]],
 # category-specific
 "B20": [["exchange or buyback", r"\b(lifetime exchange|buy ?back|exchange value|100% exchange|upgrade (?:policy|program))\b"], ["purity proof", r"\b(bis hallmark|hallmarked|huid|\d{2}\s?k(?:t|arat)?\b|purity|925 sterling)\b"]],
 "B21": [["occasion meaning", r"\b(anniversary|engagement|wedding|birthday|promise|milestone|occasion|symboli[sz]es?|meaning)\b"]],
 "B22": [["buying guide", r"\b(4\s?cs|clarity|carat|cut grade|colou?r grade|karat|buying guide|how to choose|certificate|igi|gia|sgl)\b"]],
 "B23": [["damage or loss cover", r"\b(insurance|insured|lifetime (?:maintenance|polish|plating)|free (?:repair|polish|resizing)|anti[- ]tarnish|tarnish[- ]free|water ?proof|sweat[- ]proof|daily wear)\b"]],
 "B24": [["sourcing proof", r"\b(conflict[- ]free|ethically sourced|lab[- ]grown|recycled (?:gold|silver)|natural diamond|igi certified|traceable)\b"]],
 "B25": [["permission to self-gift", r"\b(treat yourself|for yourself|self[- ]love|you deserve|buy it for you|just because)\b"]],
 "B26": [["texture or feel", r"\b(texture|fragrance|scent|smells? (?:like|of)|lightweight|non[- ]sticky|non[- ]greasy|feels? (?:like|light)|matte|dewy|absorbs (?:quickly|fast))\b"]],
 "B27": [["shade help", r"\b(shade (?:finder|guide|match|card)|find your shade|skin tones?|undertone|swatch(?:es)?)\b"]],
 "B28": [["routine guidance", r"\b(routine|layer(?:ing)?|pair (?:it )?with|use (?:after|before|with)|am\s*(?:&|/|and)\s*pm|don'?t (?:use|mix) with|avoid (?:using|mixing))\b"]],
 "B29": [["science shown", r"\b(clinically (?:studied|proven|tested|backed)|clinical (?:study|trial)|peer[- ]reviewed|research(?:ed)?|patented|formulated by|doctor|nutritionist)\b"], ["dose shown", r"\b\d+\s?(?:mg|mcg|iu|cfu|billion)\b"]],
 "B30": [["side effects and long-term use", r"\b(side[- ]effects?|non[- ]habit[- ]forming|safe for (?:daily|long[- ]term)|no dependency|who should (?:avoid|not)|consult (?:your|a) (?:doctor|physician)|pregnan)\b"]],
 "B31": [["lab proof", r"\b(lab (?:tested|report)|third[- ]party (?:tested|lab)|certificate of analysis|\bcoa\b|batch (?:no|number|report)|heavy metals?|banned substances?|tamper[- ]proof)\b"]],
 "B32": [["size and fit details", r"\b(size (?:chart|guide)|model (?:is|height|wears|wearing)|true to size|runs (?:small|large)|regular fit|relaxed fit|slim fit|oversized fit|bust|waist|chest)\b"]],
 "B33": [["fabric details", r"\b(\d{1,3}% (?:cotton|linen|polyester|silk|viscose|wool|modal|rayon|nylon|spandex|elastane)|fabric|material|gsm|wash care|machine wash|hand wash|pre[- ]shrunk|breathable|colou?rfast)\b"]],
 "B34": [["taste description", r"\b(tastes? like|flavou?r(?:ful|s)?|sweetness|savou?ry|tangy|crunchy|no aftertaste|taste guarantee)\b"]],
 "B35": [["freshness and shelf life", r"\b(best before|shelf life|expiry|manufactured on|freshly (?:made|roasted|packed|baked)|no preservatives|months from)\b"]],
 "B36": [["dimensions", r"\b(dimensions?|\d+(?:\.\d+)?\s?(?:cm|mm|inch(?:es)?|ft|feet)\b|width|depth|seat height)\b"]],
 "B37": [["assembly info", r"\b(assembly|assemble|installation|install(?:ed)?|no tools|tools included|free installation|ready to use)\b"]],
 "B38": [["compatibility and specs", r"\b(compatible with|compatibility|works with|specifications?|specs|bluetooth \d|battery|mah|watts?|usb[- ]c|connectivity)\b"]],
 "B39": [["genuine product proof", r"\b(genuine|authentic|original product|authori[sz]ed (?:seller|dealer)|official (?:store|warranty)|brand warranty|gst invoice)\b"]],
 "B40": [["age suitability", r"\b(\d+\s?(?:months?|years?|yrs?)\s?\+|suitable for (?:ages|kids|babies|newborns)|choking|safety tested|en ?71|astm)\b"]],
 "B41": [["material safety", r"\b(bpa[- ]free|phthalate[- ]free|lead[- ]free|non[- ]toxic|food[- ]grade|organic cotton|chemical[- ]free|dermatologically tested|paraben[- ]free)\b"]],
 "B42": [["pets like it", r"\b(palatab\w*|pets love|picky eaters?|taste guarantee|trial pack|sample pack)\b"]],
 "B43": [["ingredients for pets", r"\b(ingredients|grain[- ]free|no (?:artificial|preservatives|by[- ]products)|human[- ]grade|life stage|breed size|puppy|kitten|senior)\b"]],
 "B44": [["sensitivity info", r"\b(patch test|sensitive skin|non[- ]comedogenic|hypoallergenic|dermatologist[- ]tested|fragrance[- ]free|allergen|irritation)\b"]],
 "B45": [["results timeline", r"\b(?:(?:results?|visible|see|notice|difference|improve\w*|reduc\w*)\b[^.]{0,40}\b(?:in|within|after) \d{1,2} (?:days|weeks|uses)|results? (?:start|show|visible)|week \d)\b"]],
 "B46": [["certifications", r"\b(fssai|gmp|iso \d|ayush|fda|nsf|informed[- ](?:sport|choice)|licen[cs]e no|lic\.? no)\b"]],
 "B47": [["goal guidance", r"\b(for (?:weight loss|muscle|immunity|energy|sleep|stress|gut|skin|hair|joints?)|your goal|who (?:should|can) (?:take|use)|take the quiz|recommended for)\b"]],
 "B48": [["occasion and styling", r"\b(occasion|style (?:it|with|tips)|pair (?:it )?with|wear (?:it )?(?:to|for|with)|office|party wear|casual|festive|everyday|lookbook)\b"]],
 "B49": [["colour note", r"\b(colou?r may (?:slightly )?vary|actual colou?r|true to colou?r|natural light)\b"]],
 "B50": [["easy size exchange", r"\b(easy (?:exchange|returns?)|free (?:exchange|returns?|size exchange)|\d+[- ]days? (?:exchange|return)|reverse pick ?up|doorstep (?:pickup|exchange))\b"]],
 "B51": [["nutrition facts", r"\b(nutrition(?:al)? (?:facts|information|info|value)|per (?:serving|100 ?g)|calories|kcal|protein\s?\d|lab tested)\b"]],
 "B52": [["portion and value", r"\b(net (?:wt|weight|quantity)|servings?|per (?:serving|serve|cup|bar)|pack of \d)\b"]],
 "B53": [["style match", r"\b(finish|colou?r options?|in (?:your|the) room|minimal|modern|boho|scandinavian|mid[- ]century)\b"]],
 "B54": [["durability proof", r"\b(durable|durability|solid wood|sheesham|engineered wood|warranty|termite|scratch[- ]resistant|load capacity|stain[- ]resistant)\b"]],
 "B55": [["warranty and service", r"\b(\d+[- ](?:year|month)s? warranty|warranty|service (?:centers?|centres?|network)|repair|replacement)\b"]],
 "B56": [["independent proof", r"\b(lab[- ]tested|independent(?:ly)? tested|awards?|benchmark|real[- ]world|reviewed by)\b"]],
 "B57": [["expert or parent endorsement", r"\b(paediatrician|pediatrician|doctor (?:recommended|approved)|dermatologically tested|recommended by|moms? (?:love|trust))\b"]],
 "B58": [["growth and sizing", r"\b(adjustable|grows with|size (?:chart|guide)|fits (?:ages|from))\b"]],
 "B59": [["vet endorsement", r"\b(vet(?:erinarian)? (?:approved|recommended|formulated)|veterinarian|pet nutritionist)\b"]],
 "B60": [["switching guide", r"\b(transition|switch(?:ing)? (?:to|from)|introduce (?:it )?gradually|feeding guide)\b"]],
 "B61": [["performance proof", r"\b(performance|endurance|recovery|tested by athletes|pro athletes?)\b"]],
 "B62": [["activity fit", r"\b(size (?:chart|guide)|for (?:running|gym|yoga|training|cycling|cricket|trekking)|grip|support)\b"]],
 "B63": [["durability under use", r"\b(durable|heavy[- ]duty|tested for|abrasion|tear[- ]resistant|reinforced|warranty)\b"]],
 "B64": [["level guidance", r"\b(beginners?|intermediate|advanced|all levels)\b"]],
 "B73": [["play details", r"\b(\d+\s?(?:-|–|to)\s?\d+ players|players|play(?:ing)? time|how to play|rules)\b"]],
 "B74": [["standard or tier", r"\b(tournament|regulation|standard size|official|club)\b"]],
 "B75": [["replay value", r"\b(replay|expansion|endless|every game is different|variations?)\b"]],
 "B76": [["components", r"\b(what'?s in the box|components|pieces|contents|replacement parts?|spare)\b"]],
 "B77": [["authenticity", r"\b(authentic|genuine|official(?:ly)? licensed|licensed)\b"]],
 "B78": [["price basis", r"\b(grade|print run|condition|price guide|market price)\b"]],
 "B79": [["edition clarity", r"\b(edition|version|compare)\b"]],
}
# extra detectors per category for universal questions (added to the universal list)
DC = {
 "Beauty & Personal Care": {"B01": [["texture or swatch", r"\b(swatch(?:es)?|texture|before\s*(?:&|and|/)\s*after)\b"]], "B04": [["dermatologist proof", r"\b(dermatologist(?:[- ]tested| approved| recommended)?|derma)\b"]], "B12": [["full ingredients", r"\b(full ingredients|key ingredients|actives?)\b"]]},
 "Fashion & Apparel": {"B01": [["on-model and detail views", r"\b(model is wearing|on[- ]model|back view|fabric close[- ]?up|detail shot)\b"]], "B02": [["size help", r"\b(size (?:chart|guide)|true to size|runs (?:small|large)|model (?:height|is \d))\b"]]},
 "Jewellery & Accessories": {"B01": [["worn and scale shots", r"\b(on (?:hand|neck|ear|wrist)|actual size|to scale|worn|dimensions?)\b"]], "B04": [["certificate", r"\b(certificate of authenticity|certified|hallmark(?:ed)?|igi|gia|925)\b"]], "B08": [["exchange promise", r"\b(lifetime exchange|buy ?back|\d+[- ]days? (?:return|exchange))\b"]]},
 "Health & Wellness": {"B11": [["dosage", r"\b(take \d|\d+\s?(?:capsules?|tablets?|scoops?|gumm(?:y|ies)|sachets?) (?:a|per|daily|every)|daily dose|before|after meals)\b"]], "B12": [["regulatory and lab", r"\b(fssai|gmp|lab[- ]tested|third[- ]party tested)\b"]]},
 "Food & Beverages": {"B12": [["food safety", r"\b(fssai|no preservatives|no added sugar|lab[- ]tested)\b"]], "B11": [["how to prepare", r"\b(how to (?:make|prepare|brew|use)|recipe|serving suggestion)\b"]]},
 "Electronics & Gadgets": {"B14": [["warranty", r"\b(\d+[- ](?:year|month)s? warranty|warranty)\b"]], "B11": [["setup help", r"\b(user manual|setup|set up|pairing|how to connect)\b"]]},
 "Home & Living": {"B01": [["room and size views", r"\b(in the room|lifestyle|dimensions?|scale)\b"]], "B09": [["installation", r"\b(installation|assembly)\b"]]},
}
# barriers that only make sense when their trigger is on the page
NEEDS = {"B72": r"\b(subscri(?:be|ption)|auto[- ]?ship|deliver every)\b", "B27": r"\b(shade|foundation|lipstick|concealer|kajal|eyeliner|blush)\b"}
# barriers we can't grade from the page alone: they need the checkout, the ad, or a shopper session
CONFIRM = {"B70": "Checkout steps sit behind Add to cart, so we didn't open them. Check guest checkout, number of fields and one-tap payment.",
           "B65": "Add your ad headline next time and we'll check the page matches it."}
# barriers graded only from the page checks (layout), not from words on the page
CHECK_ONLY = {"B67", "B68"}

SUBS = {
 "Beauty & Personal Care": [["Skincare", r"skin ?care|serum|moisturi[sz]er|sunscreen|face ?wash|cleanser|toner|spf|night cream|face cream|acne"], ["Haircare", r"hair ?care|shampoo|conditioner|hair oil|hair mask|hair serum|hair fall|dandruff"],
   ["Makeup & Color Cosmetics", r"makeup|lipstick|foundation|kajal|mascara|eyeliner|concealer|blush|nail paint"], ["Body Care", r"body (?:wash|lotion|butter|scrub|oil)|deodorant|roll[- ]on|soap"],
   ["Fragrance & Perfume", r"perfume|fragrance|eau de|edp|edt|attar|body mist|cologne"], ["Oral Care", r"toothpaste|toothbrush|mouthwash|oral care|teeth"],
   ["Men's Grooming", r"beard|shav(?:e|ing)|razor|trimmer|men'?s grooming|aftershave|for men"], ["Sexual Wellness", r"condom|lubricant|intimate|sexual wellness"], ["Nail Care", r"nail care|cuticle|nail polish"]],
 "Fashion & Apparel": [["Women's Clothing", r"women|dress(?:es)?|tops?\b|skirt|co[- ]ord"], ["Men's Clothing", r"\bmen'?s\b|shirts?\b|trousers|chinos"], ["Ethnic & Traditional Wear", r"kurta|kurti|saree|sari|lehenga|salwar|ethnic|anarkali|dupatta"],
   ["Activewear & Sportswear", r"activewear|sportswear|leggings|joggers|gym wear|athleisure|sports bra"], ["Footwear", r"shoes?|sneakers?|sandals?|heels|footwear|slides|loafers"], ["Innerwear & Lingerie", r"bra\b|lingerie|innerwear|briefs|boxers|panties|underwear"],
   ["Bags & Wallets", r"bags?\b|wallet|backpack|tote|handbag|luggage|suitcase"], ["Eyewear", r"sunglasses|eyeglasses|spectacles|frames|eyewear|lenses"], ["Kids' Clothing", r"kids'? (?:wear|clothing)|boys|girls|infant wear"]],
 "Jewellery & Accessories": [["Fine Jewellery (Gold / Diamond)", r"\b(?:14|18|22)\s?k|gold|diamond|solitaire|platinum"], ["Fashion & Imitation Jewellery", r"imitation|fashion jewel|artificial|kundan|oxidi[sz]ed|anti[- ]tarnish"],
   ["Silver Jewellery", r"silver|925|sterling"], ["Lab-grown Diamond Jewellery", r"lab[- ]grown|lab[- ]created|lgd"], ["Men's Jewellery", r"for men|men'?s (?:ring|chain|bracelet)|kada"], ["Watches & Timepieces", r"watch(?:es)?\b|timepiece|chronograph"]],
 "Health & Wellness": [["Vitamins & Minerals", r"vitamin|multivitamin|magnesium|zinc|iron|calcium|omega|biotin|b12"], ["Sports & Fitness Nutrition", r"whey|protein|creatine|pre[- ]workout|bcaa|mass gainer|electrolyte"],
   ["Ayurvedic & Herbal", r"ayurved|herbal|ashwagandha|shilajit|tulsi|giloy|triphala|moringa"], ["Women's Health", r"pcos|pcod|women'?s health|period|menstrual|menopause|fertility|prenatal"],
   ["Men's Health", r"men'?s health|testosterone|vitality|stamina"], ["Weight Management", r"weight (?:loss|management)|fat burn|apple cider|acv|metabolism|keto"], ["Kids' Nutrition", r"for kids|kids'? nutrition|children'?s"],
   ["OTC Remedies", r"pain relief|cold|cough|antacid|balm"], ["Sleep & Mental Wellness", r"sleep|melatonin|stress|anxiety|calm|mood|focus"]],
 "Food & Beverages": [["Snacks & Munchies", r"snack|chips|namkeen|makhana|nuts|trail mix|cookies"], ["Beverages (Tea / Coffee / Juices)", r"coffee(?! table)|\btea\b(?! ?(?:table|light|towel|set of))|juice|\bdrinks?\b|cold brew|hot chocolate|kombucha"],
   ["Health Foods & Superfoods", r"superfood|muesli|granola|oats|protein bar|peanut butter|seeds"], ["Ready-to-Cook & RTE", r"ready to (?:cook|eat)|instant|heat and eat"], ["Sweets & Confectionery", r"sweets|chocolate|mithai|candy|confection|dessert"],
   ["Organic & Natural Foods", r"organic food|millet|cold[- ]pressed|a2 ghee|jaggery|honey"], ["Condiments & Sauces", r"sauce|chutney|pickle|ketchup|dip|spread|masala|spice"], ["Baby & Toddler Food", r"baby food|toddler|weaning|cerelac"]],
 "Home & Living": [["Furniture", r"sofa|\bbeds?\b|tables?\b|chairs?\b|wardrobe|cabinet|furniture|recliner|mattress|nesting|wooden|solid wood|teak|sheesham|epoxy|resin"], ["Home Decor", r"decor|vase|candle|showpiece|cushion|rug"], ["Bedding & Bath", r"bedsheet|duvet|comforter|pillow|towel|bath ?mat|bedding"],
   ["Kitchen & Dining", r"cookware|kitchen|dinnerware|pan\b|pots?\b|knife|bottle|mug|dining"], ["Lighting", r"lamp|light(?:ing)?|chandelier|bulb"], ["Storage & Organisation", r"storage|organi[sz]er|shelf|rack"],
   ["Art & Wall Decor", r"wall art|painting|frame|poster|wall decor"], ["Cleaning & Laundry", r"cleaner|detergent|laundry|mop|cleaning"], ["Plants & Garden", r"plants?\b|planter|garden|seeds|pots? for plants"]],
 "Electronics & Gadgets": [["Mobile Accessories", r"charger|cable|power ?bank|phone case|screen guard"], ["Audio (Earphones / Speakers)", r"earbuds|earphones|headphones|speaker|soundbar|tws|neckband"],
   ["Smart Wearables", r"smart ?watch|fitness band|smart ring|wearable"], ["Small Home Appliances", r"fan\b|mixer|grinder|air fryer|purifier|kettle|iron\b|vacuum"], ["Gaming", r"gaming|controller|console"],
   ["Computers & Accessories", r"laptop|keyboard|mouse|monitor|webcam"], ["Smart Home Devices", r"smart (?:plug|bulb|lock|home)|cctv|security camera"], ["Cameras & Photography", r"camera|lens|tripod|gimbal"]],
 "Baby & Kids": [["Baby Care (0-2 yrs)", r"baby (?:care|lotion|wash|oil|wipes)|newborn|infant"], ["Toddler (2-5 yrs)", r"toddler"], ["Kids' Toys & Games", r"toys?\b|puzzle|game"], ["Kids' Education", r"learning|educational|flash ?cards|activity book"],
   ["Baby Gear & Safety", r"stroller|car seat|carrier|baby gear|crib"], ["Diapers & Hygiene", r"diaper|nappy|cloth diaper|wipes"]],
 "Pet Care": [["Dog Food & Treats", r"dog food|dog treats|puppy food|kibble"], ["Cat Food & Treats", r"cat food|cat treats|kitten"], ["Pet Grooming", r"pet shampoo|grooming|brush"], ["Pet Health & Supplements", r"supplement|tick|flea|deworm"],
   ["Pet Accessories & Toys", r"leash|collar|harness|pet toy|bed for (?:dog|cat)"], ["Small Pets", r"bird|fish|hamster|rabbit"]],
 "Sports & Fitness": [["Fitness Equipment", r"dumbbell|treadmill|kettlebell|bench|resistance band|home gym"], ["Yoga & Wellness", r"yoga|mat\b|meditation|foam roller"], ["Outdoor & Adventure", r"trek|camping|hiking|cycling|outdoor"],
   ["Sports Gear & Accessories", r"racket|ball|shoes|gloves|protein shaker|bottle"], ["Cricket & Team Sports", r"cricket|bat\b|football|badminton"]],
}

out = {"v": 1, "cats": cats, "det": D, "detCat": DC, "needs": NEEDS, "confirm": CONFIRM, "checkOnly": sorted(CHECK_ONLY), "subs": SUBS}
for k, v in D.items():
    for lab, rx in v: re.compile(rx, re.I)
for c in DC.values():
    for v in c.values():
        for lab, rx in v: re.compile(rx, re.I)
js = "/* TrooGrowth buyer-question library. Built by calibration/troogrowth/build_lib.py from the Troopod Category Barrier Library. Don't edit by hand. */\nwindow.TROOGROWTH_LIB = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
open('../../assets/js/troogrowth-lib.js', 'w').write(js)
print(len(js), {k: len(v) for k, v in cats.items()})
