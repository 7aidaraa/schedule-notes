-- «ميزانية كل الأقسام» (2026-10-10): a teacher who gives two subjects in one class keeps the total in `cells`
-- and the hours per subject in `split`, so each subject shows in its own column of the grid.
update budgets set data = jsonb_set(data, '{teachers}', (
  select jsonb_agg(case when t->>'name' = 'حسين عبدالعزيز صالح القطيفي'
    then t || jsonb_build_object('split', jsonb_build_object(
      '11s-2', '{"الجيولوجيا":2,"التربية البيئية":1}'::jsonb, '11s-3', '{"الجيولوجيا":2,"التربية البيئية":1}'::jsonb,
      '11s-4', '{"الجيولوجيا":2,"التربية البيئية":1}'::jsonb, '11s-5', '{"الجيولوجيا":2,"التربية البيئية":1}'::jsonb))
    else t end order by o)
  from jsonb_array_elements(data->'teachers') with ordinality x(t, o)))
where department = 'الأحياء والجيولوجيا';
update budgets set data = jsonb_set(data, '{teachers}', (
  select jsonb_agg(case when t->>'name' = 'محمود عبدالقادر حسن ظاهر'
    then t || jsonb_build_object('split', jsonb_build_object('12a-1', '{"اللغة الفرنسية":5,"اختيار حر":1}'::jsonb))
    else t end order by o)
  from jsonb_array_elements(data->'teachers') with ordinality x(t, o)))
where department = 'اللغة الفرنسية';
