(function() {
  var WEATHER_ICONS = {
    'clear': '☀️',
    'sunny': '☀️',
    'partly-cloudy': '⛅',
    'cloudy': '☁️',
    'overcast': '☁️',
    'fog': '🌫️',
    'drizzle': '🌧️',
    'rain': '🌧️',
    'heavy-rain': '⛈️',
    'snow': '❄️',
    'sleet': '🌨️',
    'thunderstorm': '⛈️'
  };

  function getWeatherIcon(code) {
    var iconMap = {
      0: 'clear', 1: 'clear', 2: 'partly-cloudy', 3: 'overcast',
      45: 'fog', 48: 'fog',
      51: 'drizzle', 53: 'drizzle', 55: 'drizzle',
      61: 'rain', 63: 'rain', 65: 'heavy-rain',
      71: 'snow', 73: 'snow', 75: 'snow',
      80: 'rain', 81: 'rain', 82: 'heavy-rain',
      95: 'thunderstorm', 96: 'thunderstorm', 99: 'thunderstorm'
    };
    var iconKey = iconMap[code] || 'cloudy';
    return WEATHER_ICONS[iconKey] || '☁️';
  }

  function getWeatherDescription(code) {
    var descMap = {
      0: '晴朗', 1: '晴间多云', 2: '多云', 3: '阴天',
      45: '雾', 48: '雾凇',
      51: '毛毛雨', 53: '小雨', 55: '大雨',
      61: '小雨', 63: '中雨', 65: '大雨',
      71: '小雪', 73: '中雪', 75: '大雪',
      80: '阵雨', 81: '强阵雨', 82: '暴阵雨',
      95: '雷暴', 96: '雷暴伴冰雹', 99: '雷暴伴强冰雹'
    };
    return descMap[code] || '未知';
  }

  function formatWindSpeed(speed) {
    if (speed < 1) return '无风';
    if (speed < 6) return '微风';
    if (speed < 12) return '轻风';
    if (speed < 20) return '微风';
    if (speed < 29) return '和风';
    if (speed < 39) return '清风';
    return '大风';
  }

  function fetchWeather(lat, lon) {
    var weatherUrl = 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=' + lat +
      '&longitude=' + lon +
      '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m' +
      '&hourly=temperature_2m' +
      '&daily=temperature_2m_max,temperature_2m_min,weather_code' +
      '&timezone=Asia/Shanghai';

    return fetch(weatherUrl).then(function(res) {
      if (!res.ok) throw new Error('Weather API request failed');
      return res.json();
    });
  }

  function fetchCityName(lat, lon) {
    var nominatimUrl = 'https://nominatim.openstreetmap.org/reverse' +
      '?format=json' +
      '&lat=' + lat +
      '&lon=' + lon +
      '&language=zh-CN' +
      '&zoom=10';

    return fetch(nominatimUrl).then(function(res) {
      if (!res.ok) throw new Error('Geocoding API request failed');
      return res.json();
    }).then(function(data) {
      if (data.address) {
        if (data.address.city) return data.address.city;
        if (data.address.town) return data.address.town;
        if (data.address.village) return data.address.village;
        if (data.address.state) return data.address.state;
      }
      return '未知位置';
    }).catch(function() {
      return '未知位置';
    });
  }

  function renderWeather(data, cityName) {
    var current = data.current;
    var daily = data.daily;
    var icon = getWeatherIcon(current.weather_code);
    var desc = getWeatherDescription(current.weather_code);

    var html = '<div class="weather-card">' +
      '<div class="weather-header">' +
      '<span class="weather-icon">' + icon + '</span>' +
      '<span class="weather-temp">' + Math.round(current.temperature_2m) + '°</span>' +
      '</div>' +
      '<div class="weather-city">' + cityName + '</div>' +
      '<div class="weather-desc">' + desc + '</div>' +
      '<div class="weather-details">' +
      '<span>湿度 ' + current.relative_humidity_2m + '%</span>' +
      '<span>' + formatWindSpeed(current.wind_speed_10m) + '</span>' +
      '</div>' +
      '</div>';

    var container = document.getElementById('he-plugin-simple');
    if (container) {
      container.innerHTML = html;
    }
  }

  function getDefaultLocation() {
    if (typeof WIDGET !== 'undefined' && WIDGET.CONFIG) {
      var rect = WIDGET.CONFIG.rectangle;
      if (rect) {
        var parts = rect.split(',');
        if (parts.length === 2) {
          return { lon: parseFloat(parts[0]), lat: parseFloat(parts[1]) };
        }
      }
    }
    return { lon: 112.6534116, lat: 27.96920845 };
  }

  function initWeather() {
    var defaultLoc = getDefaultLocation();

    if (navigator.geolocation && !WIDGET.CONFIG.default_rectangle) {
      navigator.geolocation.getCurrentPosition(
        function(position) {
          var lat = position.coords.latitude;
          var lon = position.coords.longitude;
          loadWeather(lat, lon);
        },
        function() {
          loadWeather(defaultLoc.lat, defaultLoc.lon);
        },
        { timeout: 5000, maximumAge: 300000 }
      );
    } else {
      loadWeather(defaultLoc.lat, defaultLoc.lon);
    }
  }

  function loadWeather(lat, lon) {
    Promise.all([
      fetchWeather(lat, lon),
      fetchCityName(lat, lon)
    ]).then(function(results) {
      renderWeather(results[0], results[1]);
    }).catch(function(error) {
      console.info('Weather load failed:', error);
      renderWeather({
        current: {
          temperature_2m: 25,
          relative_humidity_2m: 60,
          weather_code: 0,
          wind_speed_10m: 5
        },
        daily: {}
      }, '本地');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWeather);
  } else {
    initWeather();
  }
})();