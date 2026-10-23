-- The base navy is now fixed at #163260 (it was #1F2D4D), and the project
-- palette is re-derived from it. Move each stored project colour to the tint
-- in the same place on the new scale, so projects keep their look and the
-- edit form still recognises their colour. Sand is a bone shade and doesn't
-- change.
update public.projects
set color = case upper(color)
  when '#1F2D4D' then '#163260'
  when '#4B566E' then '#445A7E'
  when '#777F90' then '#72829B'
  when '#A3A7B1' then '#9FA9B9'
  when '#101727' then '#0B1930'
end
where upper(color) in ('#1F2D4D', '#4B566E', '#777F90', '#A3A7B1', '#101727');
