Pod::Spec.new do |s|
  s.name           = 'IcloudDrive'
  s.version        = '1.0.0'
  s.summary        = "The app's own iCloud Drive folder"
  s.description    = 'Copies backup bundles in and out of the ubiquity container.'
  s.author         = ''
  s.homepage       = 'https://github.com/solomonxie/novel-man'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'React-Core'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
