### Design Choice

#### Which time-based visualization did you choose?
We chose the line chart to visualize the climate trends over the years.

#### Why did you choose this visualization?
Question 1 required us to find the year and station where the lowest temperature was recorded. To answer this we found the minimum temperature recorded by each station for every year. hen, for each station we plotted a separate line, Having separate lines helped us quickly find where and when the min temp was recorded.

Similarly, for Question 2 we were required to visualize changes in humididty over time and also fins of there were any seasonal patterns. We first divided our data in four seasons. We understand that humidity can be very different in winter and summer so an overall mean humidity value will hide the details. For each season, we then computed the mean humidity level every year. This allowed us to clearly see how humidity differs across seasons and how this changed over time.

#### What attributes did you choose to visualize in the parallel coordinates plot and why?
For the parallel coordinate we chose to visaulize the temperature, humidity and air pressure on the parallel axes. The question asked us to discover any relationship between temperature and humidity. Parallel coordinates is a great way to visualize relationshps. If the lines intersect, that means there is an inverse relationship. If there is similar ordering, then there is a positive relation. We also added air pressure in our parallel cooridnate plot. We thought it would be interesting to see if there are any clusters or outliers.

#### What attributes did you choose to visualize in the parallel sets and why?
For the parallel sets, we chose air pressure, distance from sea (km) and height above sea level (m). However, this type of visualization is best for sets. Therefore, we binned our data into sets. We performed threshold binning based on meteorological scales and other experts.
1. Air pressure is divided into 3 sets, low, medium and high.
2. Distance from sea (km) is divided into 2 sets, coastal (< 100km) and continental. This is standardized by a UN body called [IPCC](https://www.ipcc.ch/).
3. Height above sea level (m) is divided into 2 sets, lowland (< 200m) and mountain. This is referenced in Körner, C. et al. (2011). Mountain biodiversity, its causes and function. GMBA, University of Bern.
We chose air pressure as the axis on top as the question required us to visualize and compare the distribution of air pressure in different regions. 