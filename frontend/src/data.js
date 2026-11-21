/* Základní databáze potravin (orientační hodnoty na 100 g) + ukázkové recepty a šablony.
   Sacharidy = využitelné (bez vlákniny), tak jako na českých etiketách. Sůl v g. */
(function (root) {
  'use strict';
  const NT = (root.NT = root.NT || {});

  // [klíč, název, kategorie, kcal, bílkoviny, tuky, nasycené, sacharidy, cukry, vláknina, sůl, alergeny, porce]
  const F = [
    // obiloviny a přílohy
    ['ovesne_vlocky', 'Ovesné vločky (suché)', 'priloha', 372, 13, 6.5, 1.2, 57, 1, 10, 0.02, ['gluten'], [['1 lžíce', 8], ['1 hrnek', 90]]],
    ['ryze_bila_suha', 'Rýže bílá (suchá)', 'priloha', 350, 7, 0.6, 0.2, 78, 0.2, 1.3, 0.01, [], []],
    ['ryze_bila_varena', 'Rýže bílá (vařená)', 'priloha', 130, 2.7, 0.3, 0.1, 28, 0.1, 0.4, 0.01, [], []],
    ['ryze_natural_suha', 'Rýže natural (suchá)', 'priloha', 360, 7.5, 2.7, 0.5, 73, 0.9, 3.5, 0.02, [], []],
    ['testoviny_suche', 'Těstoviny (suché)', 'priloha', 365, 12.5, 1.5, 0.3, 70, 2.7, 3.2, 0.01, ['gluten'], []],
    ['testoviny_varene', 'Těstoviny (vařené)', 'priloha', 158, 5.8, 0.9, 0.2, 29, 0.6, 1.8, 0.01, ['gluten'], []],
    ['testoviny_celozrnne_suche', 'Těstoviny celozrnné (suché)', 'priloha', 350, 13, 2.5, 0.5, 62, 3, 9, 0.01, ['gluten'], []],
    ['brambory_surove', 'Brambory (syrové)', 'priloha', 77, 2, 0.1, 0, 15.4, 0.8, 2.2, 0.01, [], [['1 střední brambor', 100]]],
    ['brambory_vareny', 'Brambory (vařené)', 'priloha', 86, 1.9, 0.1, 0, 18.2, 0.9, 1.8, 0.01, [], [['1 střední brambor', 100]]],
    ['bataty_surove', 'Batáty (syrové)', 'priloha', 86, 1.6, 0.1, 0, 17, 4.2, 3, 0.14, [], []],
    ['kuskus_suchy', 'Kuskus (suchý)', 'priloha', 365, 13, 0.6, 0.1, 68, 2, 5, 0.02, ['gluten'], []],
    ['quinoa_suche', 'Quinoa (suchá)', 'priloha', 368, 14, 6, 0.7, 57, 0, 7, 0.02, [], []],
    ['pohanka_suche', 'Pohanka (suchá)', 'priloha', 343, 13, 3.4, 0.7, 61.5, 0, 10, 0.02, [], []],
    ['jahly_suche', 'Jáhly (suché)', 'priloha', 378, 11, 4.2, 0.7, 64.4, 0.5, 8.5, 0.01, [], []],
    ['bulgur_suchy', 'Bulgur (suchý)', 'priloha', 342, 12, 1.3, 0.2, 63.6, 0.4, 12.5, 0.02, ['gluten'], []],
    // pečivo
    ['chleb_zitny', 'Chléb žitný (kmínový)', 'pecivo', 240, 7.5, 1.2, 0.3, 45, 3, 5.5, 1.3, ['gluten'], [['1 krajíc (40 g)', 40]]],
    ['chleb_celozrnny', 'Chléb celozrnný (pšenično-žitný)', 'pecivo', 245, 9, 2.5, 0.5, 41, 4, 7, 1.2, ['gluten'], [['1 krajíc (40 g)', 40]]],
    ['rohlik', 'Rohlík', 'pecivo', 285, 9, 1.5, 0.3, 56, 3, 2.5, 1.5, ['gluten'], [['1 ks (45 g)', 45]]],
    ['tortilla_psenicna', 'Tortilla pšeničná', 'pecivo', 310, 8.5, 7.5, 3, 49, 3, 3, 1.5, ['gluten'], [['1 ks (60 g)', 60]]],
    // maso
    ['kureci_prsa', 'Kuřecí prsa (syrová, bez kůže)', 'maso', 110, 23, 1.5, 0.4, 0, 0, 0, 0.15, [], []],
    ['kureci_stehno', 'Kuřecí stehno (syrové, bez kůže)', 'maso', 125, 19.5, 5, 1.4, 0, 0, 0, 0.2, [], []],
    ['kruti_prsa', 'Krůtí prsa (syrová)', 'maso', 105, 24, 1, 0.3, 0, 0, 0, 0.15, [], []],
    ['veprova_panenka', 'Vepřová panenka (syrová)', 'maso', 120, 21, 3.5, 1.2, 0, 0, 0, 0.15, [], []],
    ['veprova_kyta', 'Vepřová kýta (libová, syrová)', 'maso', 140, 21, 5.5, 2, 0, 0, 0, 0.15, [], []],
    ['hovezi_zadni', 'Hovězí zadní (libové, syrové)', 'maso', 130, 21.5, 4.5, 1.8, 0, 0, 0, 0.15, [], []],
    ['hovezi_mlete', 'Mleté hovězí (cca 10 % tuku, syrové)', 'maso', 176, 20, 10, 4.3, 0, 0, 0, 0.15, [], []],
    ['sunka_vyberova', 'Šunka vepřová (výběrová)', 'maso', 105, 18, 3, 1, 1, 0.5, 0, 2.3, [], [['1 plátek (15 g)', 15]]],
    // ryby
    ['losos', 'Losos (syrový)', 'ryby', 208, 20, 13.4, 3.1, 0, 0, 0, 0.15, ['fish'], []],
    ['treska', 'Treska (syrová)', 'ryby', 82, 17.8, 0.7, 0.1, 0, 0, 0, 0.14, ['fish'], []],
    ['tunak_vlastni_stava', 'Tuňák ve vlastní šťávě (okapaný)', 'ryby', 116, 25.5, 0.8, 0.2, 0, 0, 0, 0.85, ['fish'], [['1 plechovka (okapaná, 120 g)', 120]]],
    ['pstruh', 'Pstruh duhový (syrový)', 'ryby', 140, 20, 6, 1.1, 0, 0, 0, 0.13, ['fish'], []],
    // vejce
    ['vejce', 'Vejce slepičí (celé)', 'vejce', 143, 12.6, 9.5, 3.1, 0.7, 0.4, 0, 0.35, ['eggs'], [['1 vejce (M)', 50]]],
    ['vejce_bilek', 'Vaječný bílek', 'vejce', 52, 10.9, 0.2, 0, 0.7, 0.7, 0, 0.42, ['eggs'], [['1 bílek', 33]]],
    // mléčné
    ['mleko_polotucne', 'Mléko polotučné (1,5 %)', 'mlecne', 46, 3.4, 1.5, 1, 4.8, 4.8, 0, 0.12, ['milk'], [['1 hrnek (250 ml)', 250]]],
    ['mleko_plnotucne', 'Mléko plnotučné (3,5 %)', 'mlecne', 64, 3.3, 3.6, 2.3, 4.7, 4.7, 0, 0.1, ['milk'], [['1 hrnek (250 ml)', 250]]],
    ['tvaroh_polotucny', 'Tvaroh polotučný', 'mlecne', 100, 12, 4, 2.6, 3.5, 3.5, 0, 0.1, ['milk'], []],
    ['tvaroh_odtucneny', 'Tvaroh odtučněný', 'mlecne', 70, 13, 0.5, 0.3, 3.5, 3.5, 0, 0.1, ['milk'], []],
    ['skyr', 'Skyr přírodní', 'mlecne', 62, 11, 0.2, 0.1, 4, 3.8, 0, 0.1, ['milk'], [['1 kelímek (140 g)', 140]]],
    ['jogurt_bily', 'Bílý jogurt (cca 3 % tuku)', 'mlecne', 62, 3.8, 3, 2, 4.7, 4.7, 0, 0.1, ['milk'], [['1 kelímek (150 g)', 150]]],
    ['jogurt_recky', 'Řecký jogurt (cca 5 % tuku)', 'mlecne', 97, 8.5, 5, 3.4, 4, 4, 0, 0.1, ['milk'], []],
    ['cottage', 'Cottage sýr (polotučný)', 'mlecne', 98, 11, 4.3, 2.7, 3.4, 3.4, 0, 0.7, ['milk'], [['1 kelímek (180 g)', 180]]],
    ['eidam_30', 'Eidam 30 %', 'mlecne', 250, 28, 15, 9.5, 0.5, 0.5, 0, 2, ['milk'], [['1 plátek (20 g)', 20]]],
    ['mozzarella', 'Mozzarella (čerstvá)', 'mlecne', 240, 18, 18, 11, 1, 0.5, 0, 0.6, ['milk'], [['1 kulička (125 g)', 125]]],
    ['parmazan', 'Parmazán', 'mlecne', 392, 36, 26, 16, 1, 0.8, 0, 3.8, ['milk'], []],
    ['maslo', 'Máslo', 'mlecne', 745, 0.6, 82, 52, 0.7, 0.7, 0, 0.03, ['milk'], [['1 lžička', 5], ['1 porce', 10]]],
    ['smetana_vareni', 'Smetana na vaření (12 %)', 'mlecne', 135, 3, 12, 8, 3.5, 3.5, 0, 0.1, ['milk'], []],
    ['napoj_sojovy', 'Sójový nápoj (neslazený)', 'napoje', 33, 3.3, 1.8, 0.3, 0.5, 0.2, 0.5, 0.1, ['soy'], [['1 hrnek (250 ml)', 250]]],
    ['napoj_ovesny', 'Ovesný nápoj (neslazený)', 'napoje', 45, 1, 1.5, 0.2, 6.7, 4.1, 0.8, 0.1, ['gluten'], [['1 hrnek (250 ml)', 250]]],
    // luštěniny
    ['cocka_cervena', 'Čočka červená (suchá)', 'luskoviny', 350, 24, 1.5, 0.2, 52, 2, 10.8, 0.02, [], []],
    ['cizrna_konzerva', 'Cizrna (konzerva, okapaná)', 'luskoviny', 138, 7, 2.6, 0.3, 17.5, 3, 6, 0.7, [], []],
    ['fazole_cervene_konzerva', 'Fazole červené (konzerva, okapané)', 'luskoviny', 105, 7, 0.5, 0.1, 13.5, 1, 5.5, 0.6, [], []],
    ['tofu', 'Tofu natural', 'luskoviny', 120, 12.5, 7, 1.2, 1.5, 0.5, 1, 0.02, ['soy'], []],
    // zelenina
    ['hrasek_mrazeny', 'Hrášek (mražený)', 'zelenina', 77, 5, 0.4, 0.1, 9.5, 4.5, 4.5, 0.1, [], []],
    ['brokolice', 'Brokolice', 'zelenina', 34, 2.8, 0.4, 0.1, 4, 1.7, 2.6, 0.08, [], []],
    ['mrkev', 'Mrkev', 'zelenina', 41, 0.9, 0.2, 0, 6.8, 4.7, 2.8, 0.17, [], []],
    ['rajce', 'Rajče', 'zelenina', 18, 0.9, 0.2, 0, 2.7, 2.6, 1.2, 0.01, [], [['1 ks (střední, 120 g)', 120]]],
    ['okurka', 'Okurka', 'zelenina', 15, 0.7, 0.1, 0, 3.1, 1.7, 0.5, 0.01, [], []],
    ['paprika_cervena', 'Paprika červená', 'zelenina', 31, 1, 0.3, 0.1, 4.5, 4.2, 2.1, 0.01, [], [['1 ks (150 g)', 150]]],
    ['cuketa', 'Cuketa', 'zelenina', 17, 1.2, 0.3, 0.1, 2.4, 2, 1, 0.02, [], []],
    ['spenat', 'Špenát', 'zelenina', 23, 2.9, 0.4, 0.1, 1.4, 0.4, 2.2, 0.2, [], []],
    ['salat_ledovy', 'Salát ledový', 'zelenina', 14, 0.9, 0.1, 0, 1.8, 1, 1.2, 0.03, [], []],
    ['zeli_bile', 'Zelí bílé', 'zelenina', 25, 1.3, 0.1, 0, 3.4, 3, 2.5, 0.05, [], []],
    ['kvetak', 'Květák', 'zelenina', 25, 1.9, 0.3, 0.1, 3, 1.9, 2, 0.08, [], []],
    ['cibule', 'Cibule', 'zelenina', 40, 1.1, 0.1, 0, 7.6, 4.2, 1.7, 0.01, [], []],
    ['cesnek', 'Česnek', 'zelenina', 149, 6.4, 0.5, 0.1, 31, 1, 2.1, 0.04, [], [['1 stroužek', 4]]],
    ['zampiony', 'Žampiony', 'zelenina', 22, 3.1, 0.3, 0.1, 2.3, 2, 1, 0.01, [], []],
    ['kukurice_konzerva', 'Kukuřice sterilovaná (okapaná)', 'zelenina', 85, 2.5, 1, 0.2, 14, 4, 2, 0.5, [], []],
    ['rajcata_konzerva', 'Rajčata krájená (konzerva)', 'zelenina', 20, 1.2, 0.1, 0, 3.2, 2.8, 1, 0.1, [], []],
    // ovoce
    ['jablko', 'Jablko', 'ovoce', 52, 0.3, 0.2, 0, 11.4, 10.4, 2.4, 0.01, [], [['1 ks (střední, 180 g)', 180]]],
    ['banan', 'Banán', 'ovoce', 89, 1.1, 0.3, 0.1, 20.2, 12.2, 2.6, 0.01, [], [['1 ks (střední, 120 g)', 120]]],
    ['pomeranc', 'Pomeranč', 'ovoce', 47, 0.9, 0.1, 0, 9.4, 9.4, 2.4, 0.01, [], [['1 ks (150 g)', 150]]],
    ['jahody', 'Jahody', 'ovoce', 32, 0.7, 0.3, 0, 5.7, 4.9, 2, 0.01, [], []],
    ['boruvky', 'Borůvky', 'ovoce', 57, 0.7, 0.3, 0, 12.1, 10, 2.4, 0.01, [], []],
    ['hrozny', 'Hroznové víno', 'ovoce', 69, 0.7, 0.2, 0.1, 17.2, 15.5, 0.9, 0.01, [], []],
    ['hruska', 'Hruška', 'ovoce', 57, 0.4, 0.1, 0, 12.1, 9.8, 3.1, 0.01, [], [['1 ks (střední, 170 g)', 170]]],
    ['kiwi', 'Kiwi', 'ovoce', 61, 1.1, 0.5, 0, 11.7, 9, 3, 0.01, [], [['1 ks (75 g)', 75]]],
    ['malina', 'Maliny', 'ovoce', 52, 1.2, 0.7, 0, 5.4, 4.4, 6.5, 0.01, [], []],
    ['datle_susene', 'Datle sušené', 'ovoce', 282, 2.5, 0.4, 0, 67, 63, 8, 0.02, [], [['1 datle', 8]]],
    ['rozinky', 'Rozinky', 'ovoce', 299, 3.1, 0.5, 0.1, 75.3, 59, 3.7, 0.1, [], []],
    // ořechy, semena, tuky
    ['avokado', 'Avokádo', 'tuky', 160, 2, 14.7, 2.1, 1.8, 0.7, 6.7, 0.02, [], [['1 avokádo (140 g)', 140]]],
    ['mandle', 'Mandle', 'orechy', 579, 21.2, 49.9, 3.8, 9.1, 4.4, 12.5, 0.01, ['nuts'], [['1 hrst', 30]]],
    ['vlasske_orechy', 'Vlašské ořechy', 'orechy', 654, 15.2, 65.2, 6.1, 7, 2.6, 6.7, 0.01, ['nuts'], [['1 hrst', 30]]],
    ['liskove_orechy', 'Lískové ořechy', 'orechy', 628, 15, 60.8, 4.5, 7, 4.3, 9.7, 0.01, ['nuts'], [['1 hrst', 30]]],
    ['arasidove_maslo', 'Arašídové máslo (100 % arašídů)', 'orechy', 610, 26, 51, 9.5, 8, 5, 6, 0.02, ['peanuts'], [['1 lžíce', 15]]],
    ['chia', 'Chia semínka', 'orechy', 486, 16.5, 30.7, 3.3, 7.7, 0, 34.4, 0.05, [], [['1 lžíce', 12]]],
    ['lnene_seminko', 'Lněné semínko', 'orechy', 534, 18.3, 42.2, 3.7, 1.6, 1.5, 27.3, 0.07, [], [['1 lžíce', 10]]],
    ['slunecnice_seminka', 'Slunečnicová semínka', 'orechy', 584, 20.8, 51.5, 4.5, 11.4, 2.6, 8.6, 0.01, [], [['1 lžíce', 10]]],
    ['dynova_seminka', 'Dýňová semínka', 'orechy', 559, 30.2, 49, 8.7, 4.7, 1.4, 6, 0.01, [], [['1 lžíce', 10]]],
    ['olej_olivovy', 'Olivový olej', 'tuky', 884, 0, 100, 14, 0, 0, 0, 0, [], [['1 lžíce', 10], ['1 lžička', 5]]],
    ['olej_repkovy', 'Řepkový olej', 'tuky', 884, 0, 100, 7, 0, 0, 0, 0, [], [['1 lžíce', 10], ['1 lžička', 5]]],
    // sladkosti, nápoje, doplňky
    ['med', 'Med', 'sladkosti', 304, 0.3, 0, 0, 82, 82, 0, 0.01, [], [['1 lžička', 8], ['1 lžíce', 20]]],
    ['cokolada_horka_70', 'Čokoláda hořká (70 %)', 'sladkosti', 600, 8, 43, 25, 35, 24, 11, 0.02, [], [['1 dílek', 8]]],
    ['cukr', 'Cukr', 'sladkosti', 400, 0, 0, 0, 100, 100, 0, 0, [], [['1 lžička', 5]]],
    ['dzus_pomerancovy', 'Pomerančový džus (100 %)', 'napoje', 45, 0.7, 0.2, 0, 9.5, 8.4, 0.2, 0.01, [], [['1 sklenice (200 ml)', 200]]],
    ['kava_cerna', 'Káva černá (bez cukru)', 'napoje', 2, 0.1, 0, 0, 0, 0, 0, 0.01, [], [['1 šálek (150 ml)', 150]]],
    // nápoje (další)
    ['voda', 'Voda (neperlivá)', 'napoje', 0, 0, 0, 0, 0, 0, 0, 0, [], [['1 sklenice (250 ml)', 250], ['1 láhev (500 ml)', 500]]],
    ['mineralka', 'Minerální voda', 'napoje', 0, 0, 0, 0, 0, 0, 0, 0.03, [], [['1 sklenice (250 ml)', 250], ['1 láhev (500 ml)', 500]]],
    ['caj_cerny', 'Čaj černý (bez cukru)', 'napoje', 1, 0, 0, 0, 0.2, 0, 0, 0, [], [['1 hrnek (250 ml)', 250]]],
    ['caj_zeleny', 'Čaj zelený (bez cukru)', 'napoje', 1, 0, 0, 0, 0.2, 0, 0, 0, [], [['1 hrnek (250 ml)', 250]]],
    ['caj_bylinkovy', 'Čaj bylinkový nebo ovocný (bez cukru)', 'napoje', 1, 0, 0, 0, 0.2, 0, 0, 0, [], [['1 hrnek (250 ml)', 250]]],
    ['mandlovy_napoj', 'Mandlový nápoj (neslazený)', 'napoje', 15, 0.6, 1.2, 0.1, 0.1, 0.1, 0.2, 0.1, ['nuts'], [['1 sklenice (250 ml)', 250]]],
    ['ryzovy_napoj', 'Rýžový nápoj', 'napoje', 47, 0.1, 1, 0.1, 9.4, 4, 0, 0.1, [], [['1 sklenice (250 ml)', 250]]],
    ['kokosovy_napoj', 'Kokosový nápoj (neslazený)', 'napoje', 19, 0.2, 1.1, 1, 2.1, 2, 0.1, 0.1, [], [['1 sklenice (250 ml)', 250]]],
    ['kokosova_voda', 'Kokosová voda', 'napoje', 19, 0.7, 0.2, 0.2, 3.7, 2.6, 1.1, 0.07, [], [['1 sklenice (250 ml)', 250]]],
    ['dzus_jablecny', 'Jablečný džus (100 %)', 'napoje', 46, 0.1, 0.1, 0, 11, 10.5, 0.2, 0.01, [], [['1 sklenice (200 ml)', 200]]],
    ['dzus_rajcatovy', 'Rajčatový džus', 'napoje', 17, 0.8, 0.1, 0, 3, 3, 0.6, 0.6, [], [['1 sklenice (200 ml)', 200]]],
    ['kola', 'Kola', 'napoje', 42, 0, 0, 0, 10.6, 10.6, 0, 0.01, [], [['1 plechovka (330 ml)', 330]]],
    ['kola_zero', 'Kola bez cukru (zero)', 'napoje', 0, 0, 0, 0, 0, 0, 0, 0.02, [], [['1 plechovka (330 ml)', 330]]],
    ['limonada', 'Limonáda slazená', 'napoje', 40, 0, 0, 0, 10, 10, 0, 0.01, [], [['1 sklenice (250 ml)', 250]]],
    ['iontovy_napoj', 'Iontový nápoj', 'napoje', 24, 0, 0, 0, 6, 6, 0, 0.1, [], [['1 láhev (500 ml)', 500]]],
    ['energeticky_napoj', 'Energetický nápoj', 'napoje', 45, 0, 0, 0, 11, 11, 0, 0.1, [], [['1 plechovka (250 ml)', 250]]],
    ['kombucha', 'Kombucha', 'napoje', 13, 0, 0, 0, 3, 2, 0, 0.02, [], [['1 sklenice (250 ml)', 250]]],
    ['pivo_nealko', 'Pivo nealkoholické', 'napoje', 26, 0.3, 0, 0, 5.2, 0.5, 0, 0.01, ['gluten'], [['1 láhev (500 ml)', 500]]],
    ['kefir', 'Kefír', 'mlecne', 51, 3.4, 2, 1.3, 4.7, 4.7, 0, 0.1, ['milk'], [['1 sklenice (250 ml)', 250]]],
    ['podmasli', 'Podmáslí', 'mlecne', 37, 3.3, 0.5, 0.3, 4.8, 4.8, 0, 0.1, ['milk'], [['1 sklenice (250 ml)', 250]]],
    ['hummus', 'Hummus', 'luskoviny', 166, 8, 9.6, 1.4, 14, 0.3, 6, 0.7, ['sesame'], [['1 lžíce', 20]]],
    ['ananas', 'Ananas', 'ovoce', 50, 0.5, 0.1, 0, 11, 10, 1.4, 0, [], [['1 plátek', 80]]],
    ['mango', 'Mango', 'ovoce', 60, 0.8, 0.4, 0.1, 13.4, 13, 1.6, 0, [], [['1 ks (150 g jedlé)', 150]]],
    ['protein_syrovatka', 'Syrovátkový protein (cca 80 %)', 'doplnky', 400, 80, 6, 3.5, 7, 5, 0, 0.5, ['milk'], [['1 odměrka (30 g)', 30]]]
  ];

  NT.BASE_FOODS = F.map((r) => ({
    id: 'b_' + r[0].replace(/[^a-z0-9_]/gi, ''),
    name: r[1], cat: r[2], kcal: r[3], protein: r[4], fat: r[5], satFat: r[6], carbs: r[7],
    sugar: r[8], fiber: r[9], salt: r[10], allergens: r[11].slice(),
    portions: r[12].map((p) => ({ name: p[0], g: p[1] })),
    source: 'base', origin: 'curated', verified: false, note: ''
  })).concat((NT.NUTRIDB || []).map((r) => ({
    id: 'b_nd' + r[0], name: r[1], cat: r[2], kcal: r[3], protein: r[4], fat: r[5], satFat: r[6], carbs: r[7],
    sugar: r[8], fiber: r[9], salt: r[10], allergens: r[11].slice(), portions: [],
    source: 'base', origin: 'nutridb', verified: true, note: ''
  })));
  NT.baseId = (key) => 'b_' + key.replace(/[^a-z0-9_]/gi, '');

  const I = (key, grams) => ({ foodId: NT.baseId(key), grams });
  NT.STARTER_RECIPES = [
    {
      id: 'rstart01', name: 'Ovesná kaše s tvarohem a borůvkami', servings: 1, timeMin: 10, mealTypes: ['Snídaně'], tags: ['rychlé', 'vegetariánské'],
      ingredients: [I('ovesne_vlocky', 60), I('mleko_polotucne', 200), I('tvaroh_odtucneny', 100), I('boruvky', 80), I('med', 8)],
      steps: ['Vločky svař v mléce 3–4 minuty za občasného míchání.', 'Nech mírně zchladnout, vmíchej tvaroh.', 'Přidej borůvky a med.'],
      notes: 'Ukázkový recept. Hodnoty vycházejí z orientační základní databáze.', source: 'Ukázka', starter: true
    },
    {
      id: 'rstart02', name: 'Skyr s jahodami a mandlemi', servings: 1, timeMin: 5, mealTypes: ['Svačina'], tags: ['rychlé', 'bez vaření'],
      ingredients: [I('skyr', 200), I('jahody', 100), I('mandle', 15)],
      steps: ['Skyr dej do misky.', 'Přidej nakrájené jahody a nasekané mandle.'], notes: 'Ukázkový recept.', source: 'Ukázka', starter: true
    },
    {
      id: 'rstart03', name: 'Kuřecí prsa s rýží a brokolicí', servings: 1, timeMin: 30, mealTypes: ['Oběd', 'Večeře'], tags: ['bílkovinné', 'bez lepku'],
      ingredients: [I('kureci_prsa', 150), I('ryze_bila_suha', 70), I('brokolice', 200), I('olej_olivovy', 8)],
      steps: ['Rýži uvař podle návodu.', 'Kuřecí prsa nakrájej na plátky, orestuj na oleji do zlatova a dodělej pod pokličkou.', 'Brokolici krátce povař v osolené vodě (3–4 minuty) a podávej společně.'],
      notes: 'Hmotnosti jsou v syrovém stavu (maso, rýže).', source: 'Ukázka', starter: true
    },
    {
      id: 'rstart04', name: 'Losos s batáty a špenátem', servings: 1, timeMin: 35, mealTypes: ['Večeře', 'Oběd'], tags: ['ryba', 'bez lepku'],
      ingredients: [I('losos', 150), I('bataty_surove', 200), I('spenat', 100), I('olej_olivovy', 5)],
      steps: ['Batáty nakrájej na kostky a pec 25 minut na 200 °C.', 'Losos osol a opeč na pánvi z obou stran, nebo ho dopeč s batáty posledních 12 minut.', 'Špenát krátce orestuj na troše oleje s česnekem.'],
      notes: 'Hmotnosti jsou v syrovém stavu.', source: 'Ukázka', starter: true
    },
    {
      id: 'rstart05', name: 'Těstoviny s tuňákem a rajčaty', servings: 1, timeMin: 20, mealTypes: ['Oběd', 'Večeře'], tags: ['rychlé'],
      ingredients: [I('testoviny_suche', 90), I('tunak_vlastni_stava', 80), I('rajcata_konzerva', 150), I('cibule', 30), I('olej_olivovy', 8)],
      steps: ['Těstoviny uvař podle návodu.', 'Cibuli orestuj na oleji, přidej rajčata a duš 8 minut.', 'Vmíchej tuňáka a smíchej s těstovinami.'],
      notes: 'Ukázkový recept. Těstoviny v suchém stavu.', source: 'Ukázka', starter: true
    },
    {
      id: 'rstart06', name: 'Čočkové chilli se zeleninou', servings: 1, timeMin: 30, mealTypes: ['Oběd', 'Večeře'], tags: ['veganské', 'bez lepku'],
      ingredients: [I('cocka_cervena', 60), I('fazole_cervene_konzerva', 120), I('rajcata_konzerva', 200), I('cibule', 50), I('paprika_cervena', 100), I('olej_repkovy', 8)],
      steps: ['Cibuli a papriku orestuj na oleji.', 'Přidej čočku, rajčata a půl hrnku vody, vař 15 minut.', 'Přidej fazole, dochuť kořením a prohřej.'],
      notes: 'Ukázkový recept. Čočka suchá.', source: 'Ukázka', starter: true
    }
  ];

  // ---- další ukázkové recepty (štítky jídel: více na jeden recept)
  const R = (id, name, mealTypes, tags, timeMin, ings, steps, notes) => ({
    id, name, servings: 1, timeMin, mealTypes, tags, ingredients: ings.map(([k, g]) => I(k, g)), steps,
    notes: notes || 'Ukázkový recept. Hodnoty vycházejí ze základní databáze.', source: 'Ukázka', starter: true
  });
  NT.STARTER_RECIPES = NT.STARTER_RECIPES.concat([
    R('rstart07', 'Míchaná vejce s celozrnným chlebem a rajčetem', ['Snídaně'], ['rychlé', 'vegetariánské'], 10, [['vejce', 120], ['chleb_celozrnny', 70], ['rajce', 100], ['olej_repkovy', 5]],
      ['Vejce rozklepni na rozehřátý olej a míchej do požadované konzistence.', 'Podávej s chlebem a nakrájeným rajčetem.']),
    R('rstart08', 'Ovesné palačinky se skyrem', ['Snídaně', 'Před tréninkem'], ['bílkovinné', 'vegetariánské'], 15, [['ovesne_vlocky', 50], ['vejce', 60], ['banan', 80], ['skyr', 100]],
      ['Vločky, vejce a banán rozmixuj na těstíčko.', 'Peč na lehce vymazané pánvi z obou stran.', 'Podávej se skyrem.']),
    R('rstart09', 'Řecký jogurt s jahodami a vlašskými ořechy', ['Snídaně', 'Svačina'], ['rychlé', 'bez vaření', 'vegetariánské'], 5, [['jogurt_recky', 200], ['jahody', 100], ['vlasske_orechy', 15], ['med', 5]],
      ['Jogurt dej do misky, přidej jahody, nasekané ořechy a med.']),
    R('rstart10', 'Celozrnný toast s avokádem a vejcem', ['Snídaně'], ['vegetariánské'], 10, [['chleb_celozrnny', 80], ['avokado', 60], ['vejce', 60]],
      ['Chléb opeč. Avokádo rozmačkej a namaž. Navrch dej vejce natvrdo nebo sázené.']),
    R('rstart11', 'Chia pudink s malinami', ['Snídaně', 'Svačina'], ['bez vaření', 'vegetariánské', 'připrav večer předem'], 5, [['chia', 30], ['mleko_polotucne', 200], ['malina', 80], ['med', 5]],
      ['Chia smíchej s mlékem a medem. Nech přes noc v lednici.', 'Ráno přidej maliny.']),
    R('rstart12', 'Tvarohová pomazánka s pečivem a zeleninou', ['Snídaně', 'Večeře'], ['rychlé', 'vegetariánské'], 10, [['tvaroh_polotucny', 120], ['chleb_zitny', 70], ['okurka', 100], ['paprika_cervena', 80], ['cibule', 10]],
      ['Tvaroh smíchej s nadrobno nakrájenou cibulí, solí a pepřem.', 'Podávej s chlebem a syrovou zeleninou.']),
    R('rstart13', 'Ovesná kaše s banánem a arašídovým máslem', ['Snídaně', 'Před tréninkem'], ['vegetariánské', 'energie'], 10, [['ovesne_vlocky', 60], ['mleko_polotucne', 250], ['banan', 100], ['arasidove_maslo', 15]],
      ['Vločky uvař v mléce. Navrch dej plátky banánu a lžíci arašídového másla.']),
    R('rstart14', 'Omeleta se špenátem a mozzarellou', ['Snídaně', 'Večeře'], ['bez lepku', 'vegetariánské'], 12, [['vejce', 180], ['spenat', 80], ['mozzarella', 40], ['olej_repkovy', 5]],
      ['Špenát krátce orestuj. Zalij rozšlehanými vejci.', 'Posyp mozzarellou, přeložení a dopeč pod poklicí.']),
    R('rstart15', 'Cottage s rajčetem a žitným chlebem', ['Svačina', 'Večeře'], ['rychlé', 'vegetariánské'], 5, [['cottage', 150], ['chleb_zitny', 50], ['rajce', 100]],
      ['Chléb namaž cottage a obloz rajčetem.']),
    R('rstart16', 'Jablko s arašídovým máslem', ['Svačina', 'Před tréninkem'], ['rychlé', 'vegan', 'bez vaření'], 3, [['jablko', 180], ['arasidove_maslo', 20]],
      ['Jablko nakrájej na měsíčky, namáčej do arašídového másla.']),
    R('rstart17', 'Hummus s mrkví a paprikou', ['Svačina'], ['rychlé', 'vegan', 'bez vaření'], 5, [['hummus', 60], ['mrkev', 100], ['paprika_cervena', 100]],
      ['Zeleninu nakrájej na tyčinky a podávej s hummusem.']),
    R('rstart18', 'Odtučněný tvaroh s borůvkami', ['Svačina'], ['rychlé', 'bílkovinné', 'vegetariánské'], 3, [['tvaroh_odtucneny', 150], ['boruvky', 80], ['med', 5]],
      ['Tvaroh promíchej s borůvkami a medem.']),
    R('rstart19', 'Banán se skyrem a mandlemi', ['Svačina', 'Po tréninku'], ['rychlé', 'bílkovinné', 'vegetariánské'], 3, [['banan', 120], ['skyr', 150], ['mandle', 10]],
      ['Banán nakrájej do skyru a posyp nasekanými mandlemi.']),
    R('rstart20', 'Mandle a sušené ovoce', ['Svačina', 'Před tréninkem'], ['rychlé', 'vegan', 'bez vaření'], 1, [['mandle', 25], ['rozinky', 20]],
      ['Smíchej a odvaž. Hodí se do tašky na cestu.']),
    R('rstart21', 'Proteinový koktejl s banánem', ['Nápoj', 'Po tréninku', 'Svačina'], ['rychlé', 'bílkovinné', 'vegetariánské'], 3, [['protein_syrovatka', 30], ['mleko_polotucne', 250], ['banan', 100]],
      ['Vše rozmixuj do hladka.']),
    R('rstart22', 'Zelený smoothie se špenátem', ['Nápoj', 'Snídaně', 'Svačina'], ['rychlé', 'vegan'], 5, [['spenat', 50], ['banan', 100], ['jablko', 100], ['napoj_ovesny', 200]],
      ['Vše rozmixuj do hladka. Podle chuti přidej led.']),
    R('rstart23', 'Jahodový smoothie s jogurtem', ['Nápoj', 'Svačina'], ['rychlé', 'vegetariánské'], 5, [['jahody', 120], ['jogurt_bily', 150], ['banan', 80]],
      ['Vše rozmixuj do hladka.']),
    R('rstart24', 'Horká čokoláda z hořké čokolády', ['Nápoj', 'Dezert'], ['vegetariánské'], 5, [['mleko_polotucne', 250], ['cokolada_horka_70', 20]],
      ['Mléko zahřej, čokoládu v něm rozpusť a promíchej.']),
    R('rstart25', 'Latte (káva s mlékem)', ['Nápoj', 'Snídaně'], ['rychlé', 'vegetariánské'], 3, [['kava_cerna', 100], ['mleko_polotucne', 200]],
      ['Připrav silnou kávu a zalij zahřátým mlékem.']),
    R('rstart26', 'Kuřecí nudličky se zeleninou a rýží', ['Oběd', 'Večeře'], ['bílkovinné', 'bez lepku'], 25, [['kureci_prsa', 140], ['ryze_bila_suha', 70], ['paprika_cervena', 100], ['cuketa', 100], ['olej_repkovy', 8]],
      ['Rýži uvař. Maso nakrájej na nudličky a orestuj na oleji.', 'Přidej zeleninu a krátce duš. Podávej s rýží.'], 'Hmotnosti jsou v syrovém stavu.'),
    R('rstart27', 'Chilli con carne s rýží', ['Oběd'], ['bílkovinné', 'bez lepku'], 35, [['hovezi_mlete', 120], ['fazole_cervene_konzerva', 120], ['rajcata_konzerva', 150], ['cibule', 40], ['ryze_bila_suha', 60], ['olej_repkovy', 5]],
      ['Cibuli a maso orestuj, přidej rajčata a fazole.', 'Duš 20 minut, dochuť chilli a kmínem. Podávej s rýží.'], 'Hmotnosti jsou v syrovém stavu.'),
    R('rstart28', 'Pečený pstruh s bramborami a okurkovým salátem', ['Oběd', 'Večeře'], ['ryba', 'bez lepku'], 35, [['pstruh', 180], ['brambory_surove', 250], ['okurka', 100], ['olej_repkovy', 8]],
      ['Brambory nakrájej na měsíčky a pec 25 minut na 200 °C.', 'Pstruha osol a přidej k bramborům na posledních 15 minut.', 'Okurku nakrájej na salát.'], 'Hmotnosti jsou v syrovém stavu.'),
    R('rstart29', 'Pečená treska s kuskusem a zeleninou', ['Oběd', 'Večeře'], ['ryba', 'nízkotučné'], 25, [['treska', 180], ['kuskus_suchy', 70], ['cuketa', 100], ['rajce', 100], ['olej_olivovy', 8]],
      ['Kuskus zalij horkou vodou a nech nabobtnat.', 'Treskou osol a opeč na pánvi 3 minuty z každé strany.', 'Zeleninu orestuj a smíchej s kuskusem.']),
    R('rstart30', 'Krůtí prsa s bulgurem a brokolicí', ['Oběd', 'Večeře'], ['bílkovinné'], 25, [['kruti_prsa', 150], ['bulgur_suchy', 70], ['brokolice', 150], ['olej_repkovy', 8]],
      ['Bulgur uvař podle návodu.', 'Maso nakrájej a orestuj do zlatova. Brokolici povař 4 minuty.'], 'Hmotnosti jsou v syrovém stavu.'),
    R('rstart31', 'Tofu s rýží natural a zeleninou', ['Oběd', 'Večeře'], ['vegan', 'bílkovinné', 'bez lepku'], 25, [['tofu', 150], ['ryze_natural_suha', 70], ['brokolice', 100], ['mrkev', 80], ['olej_repkovy', 8]],
      ['Rýži uvař. Tofu nakrájej na kostky a opeč.', 'Přidej zeleninu a krátce orestuj.']),
    R('rstart32', 'Cizrnové kari s rýží', ['Oběd', 'Večeře'], ['vegan', 'bez lepku'], 30, [['cizrna_konzerva', 200], ['rajcata_konzerva', 150], ['cibule', 50], ['cesnek', 5], ['ryze_bila_suha', 60], ['olej_repkovy', 8]],
      ['Cibuli a česnek orestuj s kari kořením.', 'Přidej cizrnu a rajčata, duš 15 minut. Podávej s rýží.']),
    R('rstart33', 'Pohanka se žampiony a vejcem', ['Oběd', 'Večeře'], ['vegetariánské', 'bez lepku'], 25, [['pohanka_suche', 70], ['zampiony', 150], ['vejce', 120], ['cibule', 30], ['olej_repkovy', 8]],
      ['Pohanku uvař. Houby s cibulí orestuj.', 'Smíchej s pohankou a přidej uvařené nebo sázené vejce.']),
    R('rstart34', 'Celozrnné těstoviny s kuřetem a špenátem', ['Oběd', 'Večeře'], ['bílkovinné'], 25, [['testoviny_celozrnne_suche', 80], ['kureci_prsa', 120], ['spenat', 100], ['parmazan', 10], ['olej_olivovy', 8]],
      ['Těstoviny uvař. Maso nakrájej a orestuj.', 'Přidej špenát, smíchej s těstovinami a posyp parmazánem.']),
    R('rstart35', 'Salát s tuňákem a vejcem', ['Oběd', 'Večeře'], ['bílkovinné', 'bez vaření'], 15, [['tunak_vlastni_stava', 80], ['vejce', 60], ['salat_ledovy', 100], ['rajce', 100], ['okurka', 80], ['chleb_zitny', 50], ['olej_olivovy', 8]],
      ['Zeleninu nakrájej, přidej tuňáka a vejce natvrdo. Zálivka z oleje a citronu.', 'Podávej s chlebem.']),
    R('rstart36', 'Kuřecí wrap se zeleninou', ['Oběd', 'Večeře'], ['bílkovinné'], 15, [['tortilla_psenicna', 60], ['kureci_prsa', 100], ['salat_ledovy', 50], ['rajce', 80], ['jogurt_bily', 40]],
      ['Kuřecí maso opeč a nakrájej.', 'Na tortillu dej salát, rajče, maso a jogurtovou omáčku, zabal.'], 'Hmotnosti jsou v syrovém stavu.'),
    R('rstart37', 'Červená čočková polévka s mrkví', ['Oběd', 'Večeře'], ['vegan', 'bez lepku'], 25, [['cocka_cervena', 60], ['mrkev', 100], ['rajcata_konzerva', 150], ['cibule', 40], ['olej_repkovy', 5]],
      ['Cibuli a mrkev orestuj, přidej čočku, rajčata a 500 ml vody.', 'Vař 15 minut, rozmixuj nebo nech kousky.']),
    R('rstart38', 'Losos s quinoou a brokolicí', ['Oběd', 'Večeře'], ['ryba', 'bez lepku'], 30, [['losos', 140], ['quinoa_suche', 70], ['brokolice', 150], ['olej_olivovy', 5]],
      ['Quinou uvař. Lososa opeč na pánvi z obou stran.', 'Brokolici povař 4 minuty a podávej společně.']),
    R('rstart39', 'Vepřová panenka s bramborami a zelím', ['Oběd'], ['tradiční'], 40, [['veprova_panenka', 140], ['brambory_surove', 250], ['zeli_bile', 150], ['olej_repkovy', 8]],
      ['Brambory uvař ve slupce. Panenku nakrájej a opeč dozlatova.', 'Zelí krátce podus s kmínem.'], 'Hmotnosti jsou v syrovém stavu.'),
    R('rstart40', 'Chléb se šunkou, sýrem a zeleninou', ['Večeře', 'Snídaně', 'Svačina'], ['rychlé', 'bez vaření'], 5, [['chleb_zitny', 80], ['sunka_vyberova', 50], ['eidam_30', 30], ['rajce', 100], ['paprika_cervena', 80]],
      ['Chléb obloz šunkou, sýrem a zeleninou.']),
    R('rstart41', 'Rizoto s kuřecím a hráškem', ['Oběd', 'Večeře'], ['bílkovinné'], 30, [['ryze_bila_suha', 70], ['kureci_prsa', 120], ['hrasek_mrazeny', 80], ['cibule', 30], ['parmazan', 10], ['olej_repkovy', 8]],
      ['Cibuli orestuj, přidej nakrájené maso a rýži.', 'Zalévej vodou nebo vývarem, na konci přidej hrášek a parmazán.'], 'Hmotnosti jsou v syrovém stavu.'),
    R('rstart42', 'Jogurt s malinami a hořkou čokoládou', ['Dezert', 'Svačina'], ['rychlé', 'vegetariánské'], 3, [['jogurt_recky', 150], ['malina', 80], ['cokolada_horka_70', 15]],
      ['Jogurt dej do misky, přidej maliny a nastrouhanou čokoládu.']),
    R('rstart43', 'Ovesná kaše na sójovém nápoji s jablkem', ['Snídaně'], ['vegan', 'rychlé'], 10, [['ovesne_vlocky', 60], ['napoj_sojovy', 250], ['jablko', 120], ['vlasske_orechy', 10]],
      ['Vločky uvař v sójovém nápoji do měkka.', 'Přidej nastrouhané jablko a nasekané ořechy.']),
    R('rstart44', 'Tofu míchanice s rajčetem a chlebem', ['Snídaně', 'Večeře'], ['vegan', 'bílkovinné'], 12, [['tofu', 150], ['rajce', 100], ['chleb_zitny', 70], ['olej_repkovy', 5]],
      ['Tofu rozdrob a krátce orestuj na oleji s nakrájeným rajčetem.', 'Dochuť kurkumou, solí a pepřem. Podávej s chlebem.']),
    R('rstart45', 'Žitný chléb s hummusem a okurkou', ['Snídaně', 'Svačina', 'Večeře'], ['vegan', 'rychlé', 'bez vaření'], 5, [['chleb_zitny', 80], ['hummus', 60], ['okurka', 100], ['rajce', 80]],
      ['Chléb namaž hummusem a obloz zeleninou.']),
    R('rstart46', 'Pohanková kaše s ovocem na rýžovém nápoji', ['Snídaně'], ['vegan', 'bez lepku'], 15, [['pohanka_suche', 50], ['ryzovy_napoj', 250], ['banan', 100], ['lnene_seminko', 10]],
      ['Pohanku uvař v rýžovém nápoji do měkka.', 'Přidej plátky banánu a mleté lněné semínko.']),
    R('rstart47', 'Datle a vlašské ořechy', ['Svačina', 'Před tréninkem'], ['vegan', 'bez lepku', 'rychlé', 'bez vaření'], 1, [['datle_susene', 40], ['vlasske_orechy', 20]],
      ['Datle vypeckuj a podávej s ořechy.']),
    R('rstart48', 'Banán s lískovými ořechy a sójovým nápojem', ['Svačina', 'Nápoj'], ['vegan', 'rychlé'], 3, [['banan', 120], ['liskove_orechy', 15], ['napoj_sojovy', 200]],
      ['Banán rozmixuj se sójovým nápojem a posyp nasekanými ořechy.'])
  ]);

  const it = (rid, s) => ({ id: NT.uid('i'), type: 'recipe', refId: rid, servings: s || 1 });
  const fi = (key, g) => ({ id: NT.uid('i'), type: 'food', refId: NT.baseId(key), grams: g });
  NT.starterTemplates = function () {
    return [
      {
        id: 'tstart01', kind: 'day', name: 'Ukázkový den, bílkovinný', starter: true, dayType: 'rest', note: 'Orientační ukázka. Dolaď množství podle cílů klienta.',
        data: {
          meals: [
            { name: 'Snídaně', time: '07:30', items: [it('rstart01')] },
            { name: 'Dopolední svačina', time: '10:00', items: [it('rstart02')] },
            { name: 'Oběd', time: '12:30', items: [it('rstart03')] },
            { name: 'Odpolední svačina', time: '15:30', items: [fi('jablko', 180), fi('eidam_30', 30)] },
            { name: 'Večeře', time: '18:30', items: [it('rstart04')] }
          ]
        }
      },
      {
        id: 'tstart02', kind: 'meal', name: 'Svačina: skyr s ovocem', starter: true, note: '',
        data: { meals: [{ name: 'Svačina', time: '', items: [it('rstart02')] }] }
      }
    ];
  };
})(typeof window !== 'undefined' ? window : globalThis);
