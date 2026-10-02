-- 0097_accent_palette_cleanup.sql — la paleta de acentos pasa de 10 a 5 colores.
--
-- Se retiran los que se parecían demasiado a los cuatro de marca (0096 y el
-- cambio a magenta): cada cuenta que tenía uno de ellos pasa al más cercano.
--   Turquesa #28BDB0 -> Verde menta #00D69C
--   Verde    #10B981 -> Verde menta #00D69C
--   Violeta  #8B5CF6 -> Púrpura     #811DBC
--   Rosa     #EC4899 -> Magenta     #FF0055
--   Ámbar    #F59E0B -> Amarillo    #E1C401
-- Azul (#3B82F6) se queda: no tiene equivalente entre los de marca.
update public.profiles set accent_color = case accent_color
  when '#28BDB0' then '#00D69C'
  when '#10B981' then '#00D69C'
  when '#8B5CF6' then '#811DBC'
  when '#EC4899' then '#FF0055'
  when '#F59E0B' then '#E1C401'
end
where accent_color in ('#28BDB0', '#10B981', '#8B5CF6', '#EC4899', '#F59E0B');
